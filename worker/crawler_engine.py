"""Small HTML-to-Markdown writer; does not fetch images or call external services."""
import json
import re
from urllib.parse import urljoin, urlparse, quote
from bs4 import NavigableString, Comment


def to_markdown(root, url):
    def target(raw):
        full = urljoin(url, raw or '')
        return quote(full, safe=':/?#[]@!$&\'*+,;=%~._-') if urlparse(full).scheme in ('http', 'https') else ''

    def escape(text):
        return re.sub(r'([\\`*\[\]_|])', r'\\\1', text)

    def render(node, inline=False):
        if isinstance(node, Comment):
            return ''
        if isinstance(node, NavigableString):
            return escape(re.sub(r'\s+', ' ', str(node)))
        name = node.name
        if name == 'img':
            src = target(node.get('src') or node.get('data-src'))
            return f"![{escape(node.get('alt', ''))}]({src})" if src else ''
        if name == 'br':
            return '  \n'
        if name == 'hr':
            return '\n\n---\n\n'
        if name == 'pre':
            text = node.get_text().strip('\n')
            fence = '`' * max(3, max((len(m) for m in re.findall(r'`+', text)), default=0) + 1)
            return f'\n\n{fence}\n{text}\n{fence}\n\n'
        if name == 'table':
            rows = []
            for row in node.find_all('tr'):
                if row.find_parent('table') is not node:
                    continue
                cells = [re.sub(r'\s*\n\s*', '<br>', ''.join(render(c) for c in cell.children).strip())
                         for cell in row.find_all(['th', 'td'], recursive=False)]
                if cells:
                    rows.append(cells)
            if not rows:
                return '\n\n'
            width = max(map(len, rows))
            rows = [row + [''] * (width - len(row)) for row in rows]
            line = lambda row: '| ' + ' | '.join(row) + ' |'
            caption = node.find('caption')
            intro = render(caption) + '\n\n' if caption else ''
            return '\n\n' + intro + '\n'.join([line(rows[0]), line(['---'] * width)] + [line(row) for row in rows[1:]]) + '\n\n'
        if name in ('ul', 'ol'):
            lines = []
            for index, item in enumerate(node.find_all('li', recursive=False), 1):
                body = ''.join(render(c) for c in item.children).strip()
                prefix = f'{index}. ' if name == 'ol' else '- '
                lines.append(prefix + body.replace('\n', '\n   '))
            return '\n\n' + '\n'.join(lines) + '\n\n'
        body = ''.join(render(c, inline=(inline or name == 'a')) for c in node.children)
        if name in ('a', 'strong', 'b', 'em', 'i', 'code'):
            body = body.strip()
        if name == 'a':
            href = target(node.get('href')) if node.get('href') else ''
            body = re.sub(r'\s+', ' ', body)
            return f'[{body}]({href})' if href and body else body
        if name in ('strong', 'b'):
            return f'**{body}**' if body else ''
        if name in ('em', 'i'):
            return f'*{body}*' if body else ''
        if name == 'code':
            fence = '`' * max(1, max((len(m) for m in re.findall(r'`+', node.get_text())), default=0) + 1)
            return fence + ' ' + node.get_text() + ' ' + fence
        if name and re.fullmatch(r'h[1-6]', name):
            if not body.strip():
                return ''
            if inline:
                return '**' + body.strip() + '** '
            return '\n\n' + '#' * int(name[1]) + ' ' + body.strip() + '\n\n'
        if name == 'blockquote':
            return '\n\n' + '\n'.join('> ' + line for line in body.strip().splitlines()) + '\n\n'
        if name in ('p', 'div', 'section', 'article', 'main', 'figure', 'figcaption', 'details', 'summary'):
            if inline:
                return ' ' + body.strip() + ' ' if body.strip() else ''
            return '\n\n' + body.strip() + '\n\n' if body.strip() else ''
        return body

    output = re.sub(r'(?m)^[ \t]+$', '', render(root))
    return re.sub(r'\n{3,}', '\n\n', output).strip()


def markdown_document(page):
    header = '---\nurl: ' + json.dumps(page.get('final_url') or page['url'], ensure_ascii=False)
    header += '\ntitle: ' + json.dumps(page.get('title', ''), ensure_ascii=False)
    header += '\nstatus: ' + json.dumps(page.get('status', ''), ensure_ascii=False) + '\n---\n\n'
    if page.get('markdown'):
        return header + page['markdown'] + '\n'
    return header + '> อ่านเนื้อหาไม่ได้: ' + page.get('error', page.get('status', 'unknown')) + '\n'


"""Local CLI experiment; not a public URL-fetching service."""
import argparse
import gzip
import io
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen
from urllib.robotparser import RobotFileParser

from bs4 import BeautifulSoup
# Markdown writer included above

AGENT = 'SEOPlatformResearchBot/0.1'
MAX_BYTES = 5_000_000

NOISE_NAMES = re.compile(r'(^|[\s_-])(cookie\w*|consent\w*|breadcrumb\w*|social-share|share-buttons|search-overlay|search-modal|related-posts|related-articles)(?=$|[\s_-])', re.I)


def normalized_text(tag):
    return re.sub(r'\s+', ' ', tag.get_text(' ', strip=True)).strip()


def clean_tree(soup):
    removed = 0
    # Match containers/attributes, never delete prose just because it mentions cookies.
    for tag in list(soup.find_all(True)):
        if tag.parent is None or tag.attrs is None:
            continue
        identity = ' '.join([str(tag.get('id', ''))] + tag.get('class', []))
        style = re.sub(r'\s+', '', tag.get('style', '')).lower()
        role = tag.get('role', '').lower()
        noise = tag.name in ('script', 'style', 'nav', 'footer', 'aside', 'noscript', 'template', 'button', 'form', 'svg')
        # Keep headers inside articles: they often contain title/author/date.
        noise |= tag.name == 'header' and not tag.find_parent('article')
        noise |= tag.has_attr('hidden') or tag.get('aria-hidden', '').lower() == 'true'
        noise |= bool(re.search(r'(?:^|;)(display:none|visibility:hidden)(?:!important)?(?:;|$)', style))
        noise |= role in ('navigation', 'banner', 'contentinfo', 'search')
        noise |= bool(NOISE_NAMES.search(identity))
        if noise:
            tag.decompose()
            removed += 1
    return removed


def choose_content(soup, url=''):
    # A homepage is a collection: do not mislabel one prose-heavy card as its article.
    if urlparse(url).path.rstrip('/') in ('', '/th/home.html', '/home', '/index.html'):
        return soup.find('main') or soup.find(attrs={'role': 'main'}) or soup.body or soup, 'listing_content'
    def score(tag):
        text = normalized_text(tag)
        if len(text) < 120:
            return 0
        paragraphs = [normalized_text(p) for p in tag.find_all('p')]
        prose = sum(len(p) for p in paragraphs if len(p) >= 60)
        linked = sum(len(normalized_text(a)) for a in tag.find_all('a'))
        density = min(1, prose / max(1, len(text)))
        link_ratio = min(1, linked / max(1, len(text)))
        return prose * density * (1 - link_ratio) ** 2

    articles = [a for a in soup.find_all('article') if score(a) > 0]
    if len(articles) == 1:
        return articles[0], 'article'
    for selector in ('[itemprop="articleBody"]', 'main', '[role="main"]'):
        candidates = soup.select(selector)
        if candidates:
            best = max(candidates, key=score)
            if score(best) > 0:
                return best, 'semantic_content'
    candidates = soup.find_all(['div', 'section'])
    if candidates:
        best = max(candidates, key=score)
        if score(best) >= 150:
            return best, 'prose_density'
    return soup.body or soup, 'body_fallback'


def remove_duplicate_cards(soup):
    seen = {}
    removed = 0
    for tag in list(soup.find_all(['div', 'section', 'li', 'article'])):
        if tag.parent is None or tag.attrs is None or not tag.get('class'):
            continue
        text = normalized_text(tag)
        if not 120 <= len(text) <= 2000:
            continue
        key = (tag.name, tuple(sorted(tag.get('class', []))), text)
        if key in seen:
            # Nested layout wrappers can have identical text and classes.
            # They are not duplicate cards; removing the inner one loses all content.
            if any(parent is seen[key] for parent in tag.parents):
                continue
            tag.decompose()
            removed += 1
        else:
            seen[key] = tag
    return removed


def content_blocks(root):
    # Inline spans/links stay in their paragraph; do not split every HTML text node.
    selected = root.find_all(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'blockquote', 'pre', 'tr'])
    blocks = []
    seen = set()
    duplicates = 0
    for tag in selected:
        if any(parent is not root and parent.name in ('p', 'li', 'blockquote', 'pre', 'tr') for parent in tag.parents):
            continue
        text = normalized_text(tag) if tag.name != 'pre' else tag.get_text().strip()
        if not text:
            continue
        # Remove long identical blocks, keeping short meaningful repetitions.
        key = re.sub(r'\s+', ' ', text)
        if len(key) >= 80 and key in seen:
            duplicates += 1
            continue
        seen.add(key)
        blocks.append(text)
    if not blocks:
        blocks = [line.strip() for line in root.get_text('\n', strip=True).splitlines() if line.strip()]
    return '\n\n'.join(blocks), duplicates


def fetch(url, opener=urlopen):
    with opener(Request(url, headers={'User-Agent': AGENT}), timeout=25) as response:
        data = response.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise ValueError('response_too_large')
        if response.headers.get('Content-Encoding', '').lower() == 'gzip' or data.startswith(b'\x1f\x8b'):
            with gzip.GzipFile(fileobj=io.BytesIO(data)) as stream:
                data = stream.read(MAX_BYTES + 1)
            if len(data) > MAX_BYTES:
                raise ValueError('decompressed_response_too_large')
        elif response.headers.get('Content-Encoding', 'identity').lower() != 'identity':
            raise ValueError('unsupported_content_encoding')
        return data, response.status, response.geturl(), response.headers.get_content_type()


def extract(html, url, scope='main'):
    if scope not in ('main', 'page'):
        raise ValueError('scope must be main or page')
    soup = BeautifulSoup(html, 'html.parser')
    if not soup.find(['html', 'body', 'article', 'main', 'p', 'h1', 'div']):
        return {'status': 'unrecognized_html', 'text': ''}
    title = soup.title.get_text(' ', strip=True) if soup.title else ''
    # Challenge detection is heuristic: keep the result explicitly uncertain.
    visible = soup.get_text(' ', strip=True).lower()
    challenge = any(marker in visible for marker in (
        'verify you are human', 'checking your browser', 'just a moment...',
        'enable javascript and cookies to continue', 'ยืนยันว่าคุณเป็นมนุษย์',
    ))
    if challenge:
        return {'status': 'possible_challenge', 'title': title, 'text': ''}
    description = soup.find('meta', attrs={'name': 'description'})
    canonical = soup.find('link', rel='canonical')
    description_text = description.get('content', '') if description else ''
    canonical_url = urljoin(url, canonical['href']) if canonical and canonical.get('href') else None
    author = soup.find('meta', attrs={'name': 'author'})
    date = soup.find('meta', attrs={'property': 'article:published_time'}) or soup.find('time', datetime=True)
    author_text = author.get('content', '') if author else None
    published = (date.get('content') or date.get('datetime')) if date else None
    # Keep full-page links separately for future URL discovery.
    links = sorted({urljoin(url, a['href']) for a in soup.find_all('a', href=True)
                    if urlparse(urljoin(url, a['href'])).scheme in ('http', 'https')})
    empty_tables = sum(not normalized_text(t) for t in soup.find_all('table'))
    removed = clean_tree(soup)
    duplicate_cards = remove_duplicate_cards(soup)
    discovery_links = list(dict.fromkeys(urljoin(url, a['href']) for a in soup.find_all('a', href=True)
                           if urlparse(urljoin(url, a['href'])).scheme in ('http', 'https')))
    if scope == 'page':
        root, method = soup.body or soup, 'full_page'
    else:
        root, method = choose_content(soup, url)
    headings = [{'level': tag.name, 'text': normalized_text(tag)}
                for tag in root.find_all(['h1', 'h2', 'h3']) if normalized_text(tag)]
    text, duplicates = content_blocks(root)
    if method in ('listing_content', 'full_page'):
        # Preserve directory labels and link-only cards that paragraph scoring would omit.
        text = root.get_text('\n', strip=True)
        duplicates = 0
    content_links = sorted({urljoin(url, a['href']) for a in root.find_all('a', href=True)
                            if urlparse(urljoin(url, a['href'])).scheme in ('http', 'https')})
    warnings = []
    if empty_tables:
        warnings.append(f'พบตารางว่าง {empty_tables} ตาราง ข้อมูลอาจต้องโหลดด้วย JavaScript')
    if any(t.get('rowspan') or t.get('colspan') for t in root.find_all(['td', 'th'])):
        warnings.append('ตารางมีช่องรวม Markdown แสดงแบบตารางพื้นฐาน กรุณาตรวจรูปแบบ')
    if method == 'body_fallback':
        warnings.append('ยังแยกส่วนบทความไม่ชัดเจน กรุณาตรวจเนื้อหา')
    path = urlparse(url).path.rstrip('/')
    if path in ('', '/th/home.html', '/home', '/index.html'):
        warnings.append('URL นี้อาจเป็นหน้าแรกหรือหน้ารวม ควรใช้ URL บทความโดยตรง')
    return {
        'status': 'ok' if len(text) >= 200 else 'thin_content_or_js',
        'title': title,
        'description': description_text,
        'canonical': canonical_url, 'author': author_text, 'published_at': published,
        'headings': headings, 'links': links, 'text': text,
        'content_links': content_links, 'discovery_links': discovery_links,
        'markdown': to_markdown(root, url), 'characters': len(text), 'extraction_method': method,
        'cleanup': {'removed_elements': removed, 'duplicate_blocks_removed': duplicates + duplicate_cards},
        'warnings': warnings, 'extractor_version': '0.3', 'scope': scope,
    }


def scrape(url, fetcher=None, scope='main'):
    fetch_page = fetcher or fetch
    started = time.monotonic()
    result = {'url': url, 'fetched_at': datetime.now(timezone.utc).isoformat()}
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username:
            raise ValueError('Use an http(s) URL without credentials')
        robots_url = urljoin(url, '/robots.txt')
        robots = RobotFileParser()
        try:
            data, _, _, _ = fetch_page(robots_url)
            robots.parse(data.decode('utf-8', errors='replace').splitlines())
        except HTTPError as exc:
            if exc.code not in (404, 410):
                result.update(status='robots_unavailable', http_status=exc.code)
                return result
            robots.parse([])
        if not robots.can_fetch(AGENT, url):
            result['status'] = 'robots_disallowed'
            return result
        delay = max(1, robots.crawl_delay(AGENT) or 0)
        time.sleep(delay)
        data, status, final_url, content_type = fetch_page(url)
        result.update(http_status=status, final_url=final_url, content_type=content_type)
        if urlparse(final_url).netloc != parsed.netloc:
            result['status'] = 'cross_origin_redirect_review'
        elif content_type not in ('text/html', 'application/xhtml+xml'):
            result['status'] = 'unsupported_content_type'
        else:
            result.update(extract(data, final_url, scope=scope))
    except HTTPError as exc:
        result.update(status={401: 'authentication_required', 403: 'access_denied',
                              429: 'rate_limited'}.get(exc.code, 'http_error'),
                      http_status=exc.code)
    except (URLError, TimeoutError, OSError, ValueError) as exc:
        result.update(status='fetch_error', error=str(exc))
    finally:
        result['elapsed_seconds'] = round(time.monotonic() - started, 3)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('urls', nargs='+')
    parser.add_argument('--output', default='results.json')
    args = parser.parse_args()
    results = []
    for url in args.urls:
        result = scrape(url)
        results.append(result)
        print(f"{result['status']}: {url}")
        time.sleep(1)
    Path(args.output).write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')




"""Bounded same-origin breadth-first crawl, exporting one Markdown file per URL."""
import hashlib
import io
import json
import re
import time
import zipfile
from collections import deque
from urllib.parse import urlparse, urlunparse, unquote
# Core included above
# Markdown writer included above


def normalize_crawl_url(url):
    parsed = urlparse(url)
    if parsed.scheme.lower() not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password:
        return None
    # This first crawler deliberately skips query URLs to avoid search/filter traps.
    if parsed.query:
        return None
    path = parsed.path or '/'
    if re.search(r'\.(pdf|zip|png|jpg|jpeg|gif|svg|webp|css|js|mp4|mp3|xlsx?|docx?)$', path, re.I):
        return None
    return urlunparse((parsed.scheme.lower(), parsed.netloc.lower(), path, '', '', ''))


def crawl_site(seed, max_pages=5, max_depth=2, path_prefix='', fetcher=None,
               scope='page', on_update=None, cancelled=None, max_seconds=180):
    if type(max_pages) is not int or not 1 <= max_pages <= 10:
        raise ValueError('จำนวนหน้าต้องอยู่ระหว่าง 1–10')
    if type(max_depth) is not int or not 0 <= max_depth <= 3:
        raise ValueError('ความลึกต้องอยู่ระหว่าง 0–3')
    start = normalize_crawl_url(seed)
    if not start:
        raise ValueError('กรุณาใช้ URL หน้าเว็บที่ไม่มี query หรือส่วนเข้าสู่ระบบ')
    if path_prefix and (not path_prefix.startswith('/') or '?' in path_prefix or '#' in path_prefix):
        raise ValueError('ขอบเขตเส้นทางต้องขึ้นต้นด้วย / และไม่มี query')
    origin = urlparse(start).netloc
    pending, seen, pages = deque([(start, 0)]), {start}, []
    started = time.monotonic()
    stop_reason = 'queue_exhausted'
    while pending:
        if cancelled and cancelled():
            stop_reason = 'cancelled'
            break
        if time.monotonic() - started >= max_seconds:
            stop_reason = 'time_limit'
            break
        if len(pages) >= max_pages:
            stop_reason = 'page_limit'
            break
        url, depth = pending.popleft()
        if on_update:
            on_update({'stage': 'reading', 'current_url': url, 'attempted': len(pages), 'queued': len(pending)})
        page = scrape(url, fetcher=fetcher, scope=scope)
        page['depth'] = depth
        pages.append(page)
        if on_update:
            on_update({'stage': 'page_done', 'page': page, 'attempted': len(pages), 'queued': len(pending)})
        if page['status'] in ('rate_limited', 'access_denied', 'possible_challenge', 'robots_disallowed', 'robots_unavailable', 'authentication_required'):
            stop_reason = 'site_restricted'
            break
        # Discovery uses cleaned full-page links, separate from article-only content links.
        if depth < max_depth and page['status'] in ('ok', 'thin_content_or_js'):
            for link in page.get('discovery_links', []):
                candidate = normalize_crawl_url(link)
                if not candidate or urlparse(candidate).netloc != origin or candidate in seen:
                    continue
                if urlparse(candidate).scheme != urlparse(start).scheme:
                    continue
                decoded_path = unquote(urlparse(candidate).path)
                if path_prefix and not (decoded_path == path_prefix.rstrip('/') or decoded_path.startswith(path_prefix.rstrip('/') + '/')):
                    continue
                if len(seen) >= 1000:
                    break
                seen.add(candidate)
                pending.append((candidate, depth + 1))
    return {'seed_url': start, 'pages': pages, 'attempted': len(pages),
            'succeeded': sum(p['status'] == 'ok' for p in pages),
            'discovered': len(seen), 'stop_reason': stop_reason,
            'elapsed_seconds': round(time.monotonic() - started, 3),
            'limits': {'max_pages': max_pages, 'max_depth': max_depth, 'path_prefix': path_prefix},
            'warnings': ['ตามเฉพาะลิงก์ใน HTML ที่อ่านได้ ไม่ใช่การรับรองว่าพบทุกหน้าในเว็บไซต์']}


def crawl_zip(result):
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for page in result['pages']:
            url = page['url']
            name = re.sub(r'[^A-Za-z0-9._-]+', '_', urlparse(url).netloc + urlparse(url).path)[:140]
            name += '-' + hashlib.sha256(url.encode()).hexdigest()[:8] + '.md'
            archive.writestr(name, markdown_document(page))
        archive.writestr('manifest.json', json.dumps(result, ensure_ascii=False, indent=2))
    return output.getvalue()


"""Optional local Edge rendering, using a fresh headless profile for every page."""
from urllib.parse import urlparse
from urllib.error import HTTPError
# Core included above


def render_html(url, validator):
    try:
        from playwright.sync_api import sync_playwright, TimeoutError as BrowserTimeout
    except ImportError as exc:
        raise ValueError('โหมด JavaScript ต้องติดตั้งก่อนด้วย python -m pip install playwright') from exc
    validator(url)
    origin = urlparse(url).netloc
    with sync_playwright() as runtime:
        browser = runtime.chromium.launch(channel='msedge', headless=True)
        try:
            context = browser.new_context(user_agent=AGENT, service_workers='block', accept_downloads=False)
            def guard(route):
                request = route.request
                try:
                    if request.resource_type in ('image', 'media', 'font'):
                        return route.abort()
                    validator(request.url)
                    if request.is_navigation_request() and urlparse(request.url).netloc != origin:
                        return route.abort()
                    return route.continue_()
                except (ValueError, OSError):
                    return route.abort()
            context.route('**/*', guard)
            page = context.new_page()
            response = page.goto(url, wait_until='domcontentloaded', timeout=25000)
            try:
                page.wait_for_load_state('networkidle', timeout=10000)
            except BrowserTimeout:
                pass
            if not response:
                raise ValueError('เบราว์เซอร์ไม่ได้รับหน้าเว็บ')
            if response.status >= 400:
                raise HTTPError(url, response.status, 'Browser HTTP error', {}, None)
            if urlparse(page.url).netloc != origin:
                raise ValueError('เว็บเปลี่ยนโดเมน กรุณาใช้ URL ปลายทางโดยตรง')
            kind = response.headers.get('content-type', '').split(';')[0]
            data = page.content().encode('utf-8')
            if len(data) > MAX_BYTES:
                raise ValueError('rendered_response_too_large')
            return data, response.status, page.url, kind
        except HTTPError:
            raise
        except Exception as exc:
            raise ValueError('โหมด JavaScript อ่านไม่สำเร็จ: ' + str(exc).splitlines()[0][:220]) from exc
        finally:
            browser.close()

WEB_HTML = '<!doctype html>\n<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Crawler Studio — ทดลองอ่านเว็บไซต์</title>\n<style>\n:root{--ink:#182c3b;--muted:#637782;--line:#dfe7e9;--orange:#d65b35;--bg:#f5f8f8}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:Tahoma,Arial,sans-serif;font-size:14px}button,input{font:inherit}button{cursor:pointer}button:disabled{cursor:wait;opacity:.55}aside{position:fixed;inset:0 auto 0 0;width:236px;background:#112e38;color:#dae6e8;padding:34px 22px;display:flex;flex-direction:column}.logo{font-size:21px;letter-spacing:-.5px;font-weight:bold;display:flex;align-items:center;gap:10px}.mark{background:#e97850;color:#112e38;border-radius:10px;padding:7px 11px}.sub{font-size:11px;letter-spacing:2px;color:#95afb5;margin:15px 0 45px}.nav{border-radius:9px;background:#284650;padding:14px;color:white}.side-note{margin-top:auto;font-size:12px;color:#adc1c5;line-height:1.9;border-top:1px solid #35505a;padding-top:20px}.dot{display:inline-block;width:7px;height:7px;background:#87d7b4;border-radius:50%;margin-right:7px}main{margin-left:236px;padding:30px 42px;max-width:1600px}.top{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--line);padding-bottom:24px;color:var(--muted);font-size:12px}.pill{background:#e7f1ec;color:#2c6951;padding:7px 12px;border-radius:30px}h1{font-size:34px;letter-spacing:-1px;margin:38px 0 12px}p{line-height:1.8}.intro{color:var(--muted);margin:0 0 26px}.card{background:white;border:1px solid var(--line);border-radius:14px;padding:24px;box-shadow:0 4px 15px #17313c03}.formline{display:flex;gap:12px;margin-top:12px}.formline input{flex:1;min-width:0;background:#f8fafb;border:1px solid #ccd9dd;border-radius:8px;padding:15px;color:var(--ink)}input:focus{outline:2px solid #d65b3550;border-color:var(--orange)}.primary{border:0;background:var(--orange);color:white;border-radius:8px;padding:0 25px;font-weight:bold}.secondary{background:white;border:1px solid #d8e2e5;border-radius:7px;padding:9px 13px;color:var(--ink)}.under{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-top:14px;color:var(--muted);font-size:12px}.demo{border:0;color:var(--orange);background:transparent;padding:6px 0}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:15px;margin:22px 0}.stat{padding:19px 22px;background:white;border:1px solid var(--line);border-radius:12px}.stat small{color:var(--muted)}.stat strong{display:block;font-size:25px;margin-top:10px}.workspace{display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:20px}.result{padding:0;overflow:hidden;min-height:390px}.result-top{padding:20px 22px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center;gap:10px}.result-top strong{font-size:16px}.actions{display:flex;gap:7px}.tabs{display:flex;gap:20px;padding:0 22px;border-bottom:1px solid var(--line);overflow:auto}.tabs button{white-space:nowrap;padding:16px 0;background:none;border:0;border-bottom:2px solid transparent;color:var(--muted)}.tabs button.active{color:var(--orange);border-bottom-color:var(--orange)}#content{padding:25px;white-space:pre-wrap;line-height:1.85;overflow-wrap:anywhere;max-height:600px;overflow:auto}.empty{display:flex;flex-direction:column;justify-content:center;align-items:center;min-height:240px;text-align:center;color:var(--muted)}.empty .icon{font-size:28px;color:#93aeb6;background:#f0f5f5;padding:14px 21px;border-radius:15px;margin-bottom:14px}.empty strong{color:var(--ink);font-size:16px;margin-bottom:5px}.detail{margin-bottom:21px}.detail small{display:block;color:var(--muted);margin-bottom:7px;font-size:11px}.detail div{overflow-wrap:anywhere;line-height:1.6;font-size:12px}.info h3{font-size:14px;margin:0 0 23px}.hint{background:#f4f7f7;padding:14px;border-radius:8px;color:var(--muted);font-size:12px;line-height:1.8}.message{margin-top:16px;padding:13px 16px;border-radius:8px;background:#fff2e8;color:#98512d;line-height:1.7}.message.good{background:#eaf5ef;color:#326b50}[hidden]{display:none!important}.linkrow{padding:10px 0;border-bottom:1px solid var(--line);white-space:normal}.linkrow a{color:#326a7e}.headingrow{padding:10px 0;border-bottom:1px solid var(--line)}footer{color:var(--muted);font-size:11px;margin-top:24px;display:flex;justify-content:space-between}@media(max-width:1100px){aside{width:190px}main{margin-left:190px;padding:25px}.workspace{grid-template-columns:minmax(0,1fr)}.info{display:grid;grid-template-columns:1fr 1fr;gap:12px}.info h3,.hint{grid-column:1/-1}}@media(max-width:700px){aside{position:static;width:auto;padding:18px 20px}.sub,.nav,.side-note{display:none}main{margin:0;padding:18px}h1{font-size:27px;margin-top:25px}.stats{grid-template-columns:repeat(2,1fr)}.formline{flex-direction:column}.primary{padding:14px}.under{align-items:flex-start;flex-direction:column}.result-top{align-items:flex-start;flex-direction:column}.top{padding-bottom:16px}.card{padding:18px}.result{padding:0}}\n.options{display:flex;flex-wrap:wrap;gap:14px;margin-top:18px;align-items:end}.options label{display:flex;flex-direction:column;gap:7px;font-size:12px;color:var(--muted)}.options select,.options input{border:1px solid #ccd9dd;border-radius:7px;background:#f8fafb;color:var(--ink);padding:9px;max-width:240px}.options .check{flex-direction:row;align-items:center;padding-bottom:9px}.crawl-options{display:flex;gap:14px;flex-wrap:wrap}.job{margin:20px 0}.jobhead{display:flex;align-items:center;justify-content:space-between;gap:10px}.pagelist{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.pagepick{max-width:100%;text-align:left;font-size:12px;overflow-wrap:anywhere}.pagepick.active{border-color:var(--orange);color:var(--orange)}.progress{color:var(--muted);font-size:12px;line-height:1.8;overflow-wrap:anywhere;margin-top:12px}.actions{flex-wrap:wrap}.markdown{font-family:Consolas,monospace;font-size:13px}.hint small{display:block;margin-top:8px}\n</style></head><body>\n<aside><div class="logo"><span class="mark">C</span> Crawler Studio</div><div class="sub">SEO WORKSPACE / 01</div><div class="nav">◉ &nbsp; อ่านเว็บไซต์</div><div class="side-note"><span class="dot"></span> Python พร้อมทำงาน<br>อ่านเว็บโดยตรงจากเครื่องนี้<br>ไม่มี API key หรือเครดิตต่อหน้า</div></aside>\n<main><div class="top"><span>เครื่องมือ / อ่านเว็บไซต์</span><span class="pill">● &nbsp; Local workspace</span></div><h1>เปลี่ยนหน้าเว็บให้เป็นข้อมูล</h1><p class="intro">ใส่ URL เพื่อดึงบทความ หัวข้อ และลิงก์ พร้อมตรวจผลก่อนนำไปใช้งานต่อ</p>\n<form class="card" id="form"><label for="url"><strong>เว็บไซต์ที่ต้องการอ่าน</strong></label><div class="formline"><input id="url" type="url" placeholder="https://www.bot.or.th/th/home.html" required aria-label="URL เว็บไซต์"><button class="primary" id="run" type="submit">เริ่มอ่าน ↗</button></div>\n<div class="options"><label>วิธีอ่าน<select id="mode"><option value="single">หน้าเดียว</option><option value="crawl">ตามอ่านหน้าลูก (Crawl)</option></select></label><label>ส่วนที่ต้องการ<select id="scope"><option value="page">ทั้งหน้า โดยกรองเมนูและคุกกี้</option><option value="main">เน้นบทความหลัก</option></select></label><label class="check"><input type="checkbox" id="renderjs">โหลด JavaScript ด้วย Edge ในเครื่อง</label><div class="crawl-options" id="crawloptions" hidden><label>จำนวนหน้าสูงสุด<input id="maxpages" type="number" min="1" max="10" value="5"></label><label>ความลึก<select id="depth"><option value="1">1 ระดับ</option><option value="2" selected>2 ระดับ</option><option value="3">3 ระดับ</option></select></label><label>อ่านหน้าลูกเฉพาะเส้นทาง<input id="prefix" placeholder="เช่น /th/news-and-media/"></label></div></div>\n<div class="under"><span>ส่งออก Markdown · ตามเฉพาะเว็บเดียวกัน · เคารพ robots.txt</span><div><button class="demo" id="sample" type="button">ตั้งค่าตัวอย่าง ธปท.</button> &nbsp; <button class="demo" id="demo" type="button">ลองบทความไทยในเครื่อง →</button></div></div><div id="message" class="message" role="status" aria-live="polite" hidden></div></form>\n<div class="stats"><div class="stat"><small>ตัวอักษรในเนื้อหา</small><strong id="chars">—</strong></div><div class="stat"><small>หัวข้อในเนื้อหาที่เลือก</small><strong id="heads">—</strong></div><div class="stat"><small>ลิงก์จากทั้งหน้า</small><strong id="links">—</strong></div><div class="stat"><small>เวลาที่ใช้</small><strong id="time">—</strong></div></div>\n<section id="job" class="card job" hidden><div class="jobhead"><strong>หน้าที่อ่านในงานนี้</strong><div class="actions"><button id="cancel" class="secondary">หยุดหลังหน้าปัจจุบัน</button><button id="zip" class="secondary" disabled>ดาวน์โหลดทุกหน้า ZIP ↓</button></div></div><div id="progress" class="progress" role="status" aria-live="polite"></div><div id="pagelist" class="pagelist"></div></section>\n<div class="workspace"><section class="card result"><div class="result-top"><strong>ผลการอ่านหน้าที่เลือก</strong><div class="actions"><button class="secondary" id="copy" disabled>คัดลอกข้อความ</button><button class="secondary" id="downloadmd" disabled>Markdown ↓</button><button class="secondary" id="download" disabled>JSON ↓</button></div></div><div class="tabs" role="tablist" aria-label="รูปแบบผลลัพธ์"><button class="active" role="tab" aria-selected="true" data-tab="markdown">Markdown</button><button role="tab" aria-selected="false" data-tab="text">ข้อความ</button><button role="tab" aria-selected="false" data-tab="headings">หัวข้อ</button><button role="tab" aria-selected="false" data-tab="links">ลิงก์</button><button role="tab" aria-selected="false" data-tab="json">JSON</button></div><div id="content" role="tabpanel"><div class="empty"><span class="icon">⌘</span><strong>เริ่มจากเว็บไซต์หนึ่งหน้า</strong><span>กรอก URL ด้านบน หรือลองบทความไทยตัวอย่าง</span></div></div></section>\n<section class="card info"><h3>ข้อมูลหน้าเว็บ</h3><div class="detail"><small>สถานะ</small><div id="status">รอเริ่มอ่าน</div></div><div class="detail"><small>การคัดเนื้อหา</small><div id="cleanup">—</div></div><div class="detail"><small>ชื่อเรื่อง</small><div id="title">—</div></div><div class="detail"><small>คำอธิบายหน้า</small><div id="description">—</div></div><div class="detail"><small>URL ปลายทาง</small><div id="final">—</div></div><div class="detail"><small>Canonical</small><div id="canonical">—</div></div><div class="hint">Crawl อ่านได้สูงสุด 10 หน้า เลือกแต่ละหน้าเพื่อตรวจผลและดาวน์โหลดแยกได้<small>โหมด JavaScript ต้องมี Edge และไลบรารี Playwright บนเครื่อง ยังไม่รับประกันว่าจะอ่านผ่านทุกเว็บไซต์</small></div></section></div><footer><span>CRAWLER STUDIO · EXPERIMENT 0.3</span><span>Python / Markdown / Bounded crawl</span></footer></main>\n<meta name="local-token" content="__TOKEN__"><script src="/app.js"></script></body></html>\n'
WEB_JS = b'const token=document.querySelector(\'meta[name="local-token"]\').content;\nconst $=id=>document.getElementById(id);\nlet result=null, tab=\'markdown\', jobId=null, jobState=null, selectedUrl=null;\nconst labels={article:\'\xe0\xb8\x9a\xe0\xb8\x97\xe0\xb8\x84\xe0\xb8\xa7\xe0\xb8\xb2\xe0\xb8\xa1\',semantic_content:\'\xe0\xb8\xaa\xe0\xb9\x88\xe0\xb8\xa7\xe0\xb8\x99\xe0\xb9\x80\xe0\xb8\x99\xe0\xb8\xb7\xe0\xb9\x89\xe0\xb8\xad\xe0\xb8\xab\xe0\xb8\xb2\xe0\xb8\xab\xe0\xb8\xa5\xe0\xb8\xb1\xe0\xb8\x81\',prose_density:\'\xe0\xb8\xaa\xe0\xb9\x88\xe0\xb8\xa7\xe0\xb8\x99\xe0\xb8\x97\xe0\xb8\xb5\xe0\xb9\x88\xe0\xb8\xa1\xe0\xb8\xb5\xe0\xb9\x80\xe0\xb8\x99\xe0\xb8\xb7\xe0\xb9\x89\xe0\xb8\xad\xe0\xb8\xab\xe0\xb8\xb2\xe0\xb8\x9a\xe0\xb8\x97\xe0\xb8\x84\xe0\xb8\xa7\xe0\xb8\xb2\xe0\xb8\xa1\',listing_content:\'\xe0\xb8\xab\xe0\xb8\x99\xe0\xb9\x89\xe0\xb8\xb2\xe0\xb8\xa3\xe0\xb8\xa7\xe0\xb8\xa1\',full_page:\'\xe0\xb8\x97\xe0\xb8\xb1\xe0\xb9\x89\xe0\xb8\x87\xe0\xb8\xab\xe0\xb8\x99\xe0\xb9\x89\xe0\xb8\xb2\',body_fallback:\'\xe0\xb8\x97\xe0\xb8\xb1\xe0\xb9\x89\xe0\xb8\x87\xe0\xb8\xab\xe0\xb8\x99\xe0\xb9\x89\xe0\xb8\xb2 \xe2\x80\x94 \xe0\xb8\x84\xe0\xb8\xa7\xe0\xb8\xa3\xe0\xb8\x95\xe0\xb8\xa3\xe0\xb8\xa7\xe0\xb8\x88\xe0\xb8\x97\xe0\xb8\xb2\xe0\xb8\x99\'};\nconst messages={ok:\'\xe0\xb8\xad\xe0\xb9\x88\xe0\xb8\xb2\xe0\xb8\x99\xe0\xb9\x80\xe0\xb8\x99\xe0\xb8\xb7\xe0\xb9\x89\xe0\xb8\xad\xe0\xb8\xab\xe0\xb8\xb2\xe0\xb9\x84\xe0\xb8\x94\xe0\xb9\x89\xe0\xb9\x81\xe0\xb8\xa5\xe0\xb9\x89\xe0\xb8\xa7 \xe0\xb8\x81\xe0\xb8\xa3\xe0\xb8\xb8\xe0\xb8\x93\xe0\xb8\xb2\xe0\xb8\x95\xe0\xb8\xa3\xe0\xb8\xa7\xe0\xb8\x88\xe0\xb8\x84\xe0\xb8\xa7\xe0\xb8\xb2\xe0\xb8\xa1\xe0\xb8\x84\xe0\xb8\xa3\xe0\xb8\x9a\xe0\xb8\x81\xe0\xb9\x88\xe0\xb8\xad\xe0\xb8\x99\xe0\xb8\x99\xe0\xb8\xb3\xe0\xb9\x84\xe0\xb8\x9b\xe0\xb9\x83\xe0\xb8\x8a\xe0\xb9\x89\',thin_content_or_js:\'\xe0\xb8\x9e\xe0\xb8\x9a\xe0\xb8\x82\xe0\xb9\x89\xe0\xb8\xad\xe0\xb8\x84\xe0\xb8\xa7\xe0\xb8\xb2\xe0\xb8\xa1\xe0\xb8\x99\xe0\xb9\x89\xe0\xb8\xad\xe0\xb8\xa2 \xe0\xb8\xad\xe0\xb8\xb2\xe0\xb8\x88\xe0\xb9\x80\xe0\xb8\x9b\xe0\xb9\x87\xe0\xb8\x99\xe0\xb8\xab\xe0\xb8\x99\xe0\xb9\x89\xe0\xb8\xb2\xe0\xb8\xaa\xe0\xb8\xb1\xe0\xb9\x89\xe0\xb8\x99\xe0\xb8\xab\xe0\xb8\xa3\xe0\xb8\xb7\xe0\xb8\xad\xe0\xb8\x88\xe0\xb8\xb3\xe0\xb9\x80\xe0\xb8\x9b\xe0\xb9\x87\xe0\xb8\x99\xe0\xb8\x95\xe0\xb9\x89\xe0\xb8\xad\xe0\xb8\x87\xe0\xb8\xa3\xe0\xb8\xb1\xe0\xb8\x99 JavaScript\',possible_challenge:\'\xe0\xb8\x9e\xe0\xb8\x9a\xe0\xb8\x82\xe0\xb9\x89\xe0\xb8\xad\xe0\xb8\x84\xe0\xb8\xa7\xe0\xb8\xb2\xe0\xb8\xa1\xe0\xb8\x97\xe0\xb8\xb5\xe0\xb9\x88\xe0\xb8\xad\xe0\xb8\xb2\xe0\xb8\x88\xe0\xb9\x80\xe0\xb8\x9b\xe0\xb9\x87\xe0\xb8\x99\xe0\xb8\xab\xe0\xb8\x99\xe0\xb9\x89\xe0\xb8\xb2\xe0\xb8\x95\xe0\xb8\xa3\xe0\xb8\xa7\xe0\xb8\x88\xe0\xb8\x9a\xe0\xb8\xad\xe0\xb8\x95 \xe0\xb8\x88\xe0\xb8\xb6\xe0\xb8\x87\xe0\xb9\x84\xe0\xb8\xa1\xe0\xb9\x88\xe0\xb8\x99\xe0\xb8\xb3\xe0\xb8\xa1\xe0\xb8\xb2\xe0\xb9\x80\xe0\xb8\x9b\xe0\xb9\x87\xe0\xb8\x99\xe0\xb8\x9a\xe0\xb8\x97\xe0\xb8\x84\xe0\xb8\xa7\xe0\xb8\xb2\xe0\xb8\xa1\',robots_disallowed:\'robots.txt \xe0\xb9\x84\xe0\xb8\xa1\xe0\xb9\x88\xe0\xb8\xad\xe0\xb8\x99\xe0\xb8\xb8\xe0\xb8\x8d\xe0\xb8\xb2\xe0\xb8\x95\xe0\xb9\x83\xe0\xb8\xab\xe0\xb9\x89\xe0\xb8\xad\xe0\xb9\x88\xe0\xb8\xb2\xe0\xb8\x99\xe0\xb8\xab\xe0\xb8\x99\xe0\xb9\x89\xe0\xb8\xb2\xe0\xb8\x99\xe0\xb8\xb5\xe0\xb9\x89\',robots_unavailable:\'\xe0\xb8\x95\xe0\xb8\xa3\xe0\xb8\xa7\xe0\xb8\x88 robots.txt \xe0\xb9\x84\xe0\xb8\xa1\xe0\xb9\x88\xe0\xb8\xaa\xe0\xb8\xb3\xe0\xb9\x80\xe0\xb8\xa3\xe0\xb9\x87\xe0\xb8\x88 \xe0\xb8\x88\xe0\xb8\xb6\xe0\xb8\x87\xe0\xb8\xab\xe0\xb8\xa2\xe0\xb8\xb8\xe0\xb8\x94\xe0\xb8\xad\xe0\xb9\x88\xe0\xb8\xb2\xe0\xb8\x99\',access_denied:\'\xe0\xb9\x80\xe0\xb8\xa7\xe0\xb9\x87\xe0\xb8\x9a\xe0\xb9\x84\xe0\xb8\x8b\xe0\xb8\x95\xe0\xb9\x8c\xe0\xb8\x9b\xe0\xb8\x8f\xe0\xb8\xb4\xe0\xb9\x80\xe0\xb8\xaa\xe0\xb8\x98\xe0\xb8\x81\xe0\xb8\xb2\xe0\xb8\xa3\xe0\xb9\x80\xe0\xb8\x82\xe0\xb9\x89\xe0\xb8\xb2\xe0\xb8\x96\xe0\xb8\xb6\xe0\xb8\x87 (403)\',rate_limited:\'\xe0\xb9\x80\xe0\xb8\xa7\xe0\xb9\x87\xe0\xb8\x9a\xe0\xb9\x84\xe0\xb8\x8b\xe0\xb8\x95\xe0\xb9\x8c\xe0\xb8\x88\xe0\xb8\xb3\xe0\xb8\x81\xe0\xb8\xb1\xe0\xb8\x94\xe0\xb8\x84\xe0\xb8\xa7\xe0\xb8\xb2\xe0\xb8\xa1\xe0\xb8\x96\xe0\xb8\xb5\xe0\xb9\x88 \xe0\xb8\x88\xe0\xb8\xb6\xe0\xb8\x87\xe0\xb8\xab\xe0\xb8\xa2\xe0\xb8\xb8\xe0\xb8\x94\xe0\xb8\x81\xe0\xb9\x88\xe0\xb8\xad\xe0\xb8\x99\',authentication_required:\'\xe0\xb8\xab\xe0\xb8\x99\xe0\xb9\x89\xe0\xb8\xb2\xe0\xb8\x99\xe0\xb8\xb5\xe0\xb9\x89\xe0\xb8\x95\xe0\xb9\x89\xe0\xb8\xad\xe0\xb8\x87\xe0\xb9\x80\xe0\xb8\x82\xe0\xb9\x89\xe0\xb8\xb2\xe0\xb8\xaa\xe0\xb8\xb9\xe0\xb9\x88\xe0\xb8\xa3\xe0\xb8\xb0\xe0\xb8\x9a\xe0\xb8\x9a\',fetch_error:\'\xe0\xb9\x80\xe0\xb8\x8a\xe0\xb8\xb7\xe0\xb9\x88\xe0\xb8\xad\xe0\xb8\xa1\xe0\xb8\x95\xe0\xb9\x88\xe0\xb8\xad\xe0\xb8\xab\xe0\xb8\xa3\xe0\xb8\xb7\xe0\xb8\xad\xe0\xb8\xad\xe0\xb9\x88\xe0\xb8\xb2\xe0\xb8\x99\xe0\xb8\x82\xe0\xb9\x89\xe0\xb8\xad\xe0\xb8\xa1\xe0\xb8\xb9\xe0\xb8\xa5\xe0\xb9\x84\xe0\xb8\xa1\xe0\xb9\x88\xe0\xb8\xaa\xe0\xb8\xb3\xe0\xb9\x80\xe0\xb8\xa3\xe0\xb9\x87\xe0\xb8\x88\',http_error:\'\xe0\xb9\x80\xe0\xb8\xa7\xe0\xb9\x87\xe0\xb8\x9a\xe0\xb9\x84\xe0\xb8\x8b\xe0\xb8\x95\xe0\xb9\x8c\xe0\xb8\xaa\xe0\xb9\x88\xe0\xb8\x87\xe0\xb8\x82\xe0\xb9\x89\xe0\xb8\xad\xe0\xb8\x9c\xe0\xb8\xb4\xe0\xb8\x94\xe0\xb8\x9e\xe0\xb8\xa5\xe0\xb8\xb2\xe0\xb8\x94\xe0\xb8\x81\xe0\xb8\xa5\xe0\xb8\xb1\xe0\xb8\x9a\xe0\xb8\xa1\xe0\xb8\xb2\',unsupported_content_type:\'\xe0\xb8\xa2\xe0\xb8\xb1\xe0\xb8\x87\xe0\xb9\x84\xe0\xb8\xa1\xe0\xb9\x88\xe0\xb8\xa3\xe0\xb8\xad\xe0\xb8\x87\xe0\xb8\xa3\xe0\xb8\xb1\xe0\xb8\x9a\xe0\xb9\x84\xe0\xb8\x9f\xe0\xb8\xa5\xe0\xb9\x8c\xe0\xb8\x9b\xe0\xb8\xa3\xe0\xb8\xb0\xe0\xb9\x80\xe0\xb8\xa0\xe0\xb8\x97\xe0\xb8\x99\xe0\xb8\xb5\xe0\xb9\x89\',unrecognized_html:\'\xe0\xb9\x84\xe0\xb8\xa1\xe0\xb9\x88\xe0\xb8\x9e\xe0\xb8\x9a\xe0\xb9\x82\xe0\xb8\x84\xe0\xb8\xa3\xe0\xb8\x87\xe0\xb8\xaa\xe0\xb8\xa3\xe0\xb9\x89\xe0\xb8\xb2\xe0\xb8\x87 HTML \xe0\xb8\x97\xe0\xb8\xb5\xe0\xb9\x88\xe0\xb8\xad\xe0\xb9\x88\xe0\xb8\xb2\xe0\xb8\x99\xe0\xb9\x84\xe0\xb8\x94\xe0\xb9\x89\'};\nfunction message(text,good=false){$(\'message\').hidden=false;$(\'message\').className=\'message\'+(good?\' good\':\'\');$(\'message\').textContent=text}\nfunction busy(value){for(const id of [\'run\',\'demo\',\'sample\',\'mode\',\'scope\',\'renderjs\',\'maxpages\',\'depth\',\'prefix\',\'url\'])$(id).disabled=value}\nfunction render(){\n const box=$(\'content\');box.replaceChildren();box.classList.toggle(\'markdown\',tab===\'markdown\'||tab===\'json\');if(!result)return;\n if(tab===\'text\'||tab===\'markdown\'){box.textContent=result[tab===\'text\'?\'text\':\'markdown\']||\'\xe0\xb9\x84\xe0\xb8\xa1\xe0\xb9\x88\xe0\xb8\xa1\xe0\xb8\xb5\xe0\xb9\x80\xe0\xb8\x99\xe0\xb8\xb7\xe0\xb9\x89\xe0\xb8\xad\xe0\xb8\xab\xe0\xb8\xb2\xe0\xb8\xaa\xe0\xb8\xb3\xe0\xb8\xab\xe0\xb8\xa3\xe0\xb8\xb1\xe0\xb8\x9a\xe0\xb9\x81\xe0\xb8\xaa\xe0\xb8\x94\xe0\xb8\x87\';return}\n if(tab===\'json\'){box.textContent=JSON.stringify(result,null,2);return}\n if(tab===\'headings\'){for(const h of result.headings||[]){const row=document.createElement(\'div\');row.className=\'headingrow\';row.textContent=h.level.toUpperCase()+\'  \'+h.text;box.append(row)}}\n else{for(const link of result.links||[]){const row=document.createElement(\'div\'),a=document.createElement(\'a\');row.className=\'linkrow\';a.textContent=link;try{const u=new URL(link);if([\'https:\',\'http:\'].includes(u.protocol)){a.href=u.href;a.target=\'_blank\';a.rel=\'noopener noreferrer\'}}catch{}row.append(a);box.append(row)}}\n if(!box.childNodes.length)box.textContent=tab===\'headings\'?\'\xe0\xb9\x84\xe0\xb8\xa1\xe0\xb9\x88\xe0\xb8\x9e\xe0\xb8\x9a\xe0\xb8\xab\xe0\xb8\xb1\xe0\xb8\xa7\xe0\xb8\x82\xe0\xb9\x89\xe0\xb8\xad\':\'\xe0\xb9\x84\xe0\xb8\xa1\xe0\xb9\x88\xe0\xb8\x9e\xe0\xb8\x9a\xe0\xb8\xa5\xe0\xb8\xb4\xe0\xb8\x87\xe0\xb8\x81\xe0\xb9\x8c\';\n}\nfunction showResult(data){\n result=data;selectedUrl=data.url;$(\'chars\').textContent=(data.characters||0).toLocaleString(\'th-TH\');$(\'heads\').textContent=(data.headings||[]).length;$(\'links\').textContent=(data.links||[]).length;$(\'time\').textContent=(data.elapsed_seconds??0)+\' s\';\n $(\'cleanup\').textContent=(labels[data.extraction_method]||\'\xe2\x80\x94\')+\' \xc2\xb7 \xe0\xb8\x95\xe0\xb8\xb1\xe0\xb8\x94\xe0\xb8\xaa\xe0\xb9\x88\xe0\xb8\xa7\xe0\xb8\x99\xe0\xb8\x9b\xe0\xb8\xa3\xe0\xb8\xb0\xe0\xb8\x81\xe0\xb8\xad\xe0\xb8\x9a \'+(data.cleanup?.removed_elements||0)+\' \xe0\xb8\x88\xe0\xb8\xb8\xe0\xb8\x94 \xc2\xb7 \xe0\xb8\x95\xe0\xb8\xb1\xe0\xb8\x94\xe0\xb8\xaa\xe0\xb9\x88\xe0\xb8\xa7\xe0\xb8\x99\xe0\xb8\x8b\xe0\xb9\x89\xe0\xb8\xb3 \'+(data.cleanup?.duplicate_blocks_removed||0)+\' \xe0\xb8\x88\xe0\xb8\xb8\xe0\xb8\x94\';\n $(\'status\').textContent=(data.mode===\'demo\'?\'\xe0\xb8\x95\xe0\xb8\xb1\xe0\xb8\xa7\xe0\xb8\xad\xe0\xb8\xa2\xe0\xb9\x88\xe0\xb8\xb2\xe0\xb8\x87\xe0\xb9\x83\xe0\xb8\x99\xe0\xb9\x80\xe0\xb8\x84\xe0\xb8\xa3\xe0\xb8\xb7\xe0\xb9\x88\xe0\xb8\xad\xe0\xb8\x87 \xc2\xb7 \':\'\xe0\xb9\x80\xe0\xb8\xa7\xe0\xb9\x87\xe0\xb8\x9a\xe0\xb8\x88\xe0\xb8\xa3\xe0\xb8\xb4\xe0\xb8\x87 \xc2\xb7 \')+data.status;\n for(const id of [\'title\',\'description\',\'canonical\'])$(id).textContent=data[id]||\'\xe2\x80\x94\';$(\'final\').textContent=data.final_url||data.url;\n message((data.mode===\'demo\'?\'\xe0\xb8\x82\xe0\xb9\x89\xe0\xb8\xad\xe0\xb8\xa1\xe0\xb8\xb9\xe0\xb8\xa5\xe0\xb8\x95\xe0\xb8\xb1\xe0\xb8\xa7\xe0\xb8\xad\xe0\xb8\xa2\xe0\xb9\x88\xe0\xb8\xb2\xe0\xb8\x87\xe0\xb9\x83\xe0\xb8\x99\xe0\xb9\x80\xe0\xb8\x84\xe0\xb8\xa3\xe0\xb8\xb7\xe0\xb9\x88\xe0\xb8\xad\xe0\xb8\x87 \xc2\xb7 \':\'\')+(messages[data.status]||data.status)+(data.error?\' \xc2\xb7 \'+data.error:\'\')+(data.warnings?.length?\' \xc2\xb7 \'+data.warnings.join(\' \xc2\xb7 \'):\'\'),data.status===\'ok\'&&!data.warnings?.length);\n $(\'copy\').disabled=!data.text;$(\'downloadmd\').disabled=!data.markdown;$(\'download\').disabled=false;render();\n document.querySelectorAll(\'.pagepick\').forEach(b=>b.classList.toggle(\'active\',b.dataset.url===selectedUrl));\n}\nasync function api(path,body){const response=await fetch(path,{method:body===undefined?\'GET\':\'POST\',headers:{\'Content-Type\':\'application/json\',\'X-Local-Token\':token},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await response.json();if(!response.ok)throw Error(data.error||\'\xe0\xb8\x84\xe0\xb8\xb3\xe0\xb8\x82\xe0\xb8\xad\xe0\xb9\x84\xe0\xb8\xa1\xe0\xb9\x88\xe0\xb8\xaa\xe0\xb8\xb3\xe0\xb9\x80\xe0\xb8\xa3\xe0\xb9\x87\xe0\xb8\x88\');return data}\nfunction renderJob(state){\n jobState=state;$(\'pagelist\').replaceChildren();\n for(const [index,page] of state.pages.entries()){const b=document.createElement(\'button\');b.type=\'button\';b.className=\'secondary pagepick\'+(page.url===selectedUrl?\' active\':\'\');b.dataset.url=page.url;b.textContent=(index+1)+\'. \'+(page.title||page.url)+\' \xc2\xb7 \'+page.status;b.onclick=()=>showResult(page);$(\'pagelist\').append(b)}\n const finished=state.status!==\'running\',summary=state.result;\n const reasons={page_limit:\'\xe0\xb8\x96\xe0\xb8\xb6\xe0\xb8\x87\xe0\xb8\x88\xe0\xb8\xb3\xe0\xb8\x99\xe0\xb8\xa7\xe0\xb8\x99\xe0\xb8\xab\xe0\xb8\x99\xe0\xb9\x89\xe0\xb8\xb2\xe0\xb8\x97\xe0\xb8\xb5\xe0\xb9\x88\xe0\xb8\x81\xe0\xb8\xb3\xe0\xb8\xab\xe0\xb8\x99\xe0\xb8\x94\',queue_exhausted:\'\xe0\xb9\x84\xe0\xb8\xa1\xe0\xb9\x88\xe0\xb8\xa1\xe0\xb8\xb5\xe0\xb8\xa5\xe0\xb8\xb4\xe0\xb8\x87\xe0\xb8\x81\xe0\xb9\x8c\xe0\xb9\x83\xe0\xb8\x99\xe0\xb8\x82\xe0\xb8\xad\xe0\xb8\x9a\xe0\xb9\x80\xe0\xb8\x82\xe0\xb8\x95\xe0\xb9\x83\xe0\xb8\xab\xe0\xb9\x89\xe0\xb8\x95\xe0\xb8\xb2\xe0\xb8\xa1\xe0\xb8\x95\xe0\xb9\x88\xe0\xb8\xad\',cancelled:\'\xe0\xb8\xab\xe0\xb8\xa2\xe0\xb8\xb8\xe0\xb8\x94\xe0\xb8\x95\xe0\xb8\xb2\xe0\xb8\xa1\xe0\xb8\x84\xe0\xb8\xb3\xe0\xb8\x82\xe0\xb8\xad\',time_limit:\'\xe0\xb8\x96\xe0\xb8\xb6\xe0\xb8\x87\xe0\xb9\x80\xe0\xb8\xa7\xe0\xb8\xa5\xe0\xb8\xb2\xe0\xb8\x97\xe0\xb8\xb5\xe0\xb9\x88\xe0\xb8\x81\xe0\xb8\xb3\xe0\xb8\xab\xe0\xb8\x99\xe0\xb8\x94\',site_restricted:\'\xe0\xb8\xab\xe0\xb8\xa2\xe0\xb8\xb8\xe0\xb8\x94\xe0\xb9\x80\xe0\xb8\x9e\xe0\xb8\xa3\xe0\xb8\xb2\xe0\xb8\xb0\xe0\xb8\x82\xe0\xb9\x89\xe0\xb8\xad\xe0\xb8\x88\xe0\xb8\xb3\xe0\xb8\x81\xe0\xb8\xb1\xe0\xb8\x94\xe0\xb8\x81\xe0\xb8\xb2\xe0\xb8\xa3\xe0\xb9\x80\xe0\xb8\x82\xe0\xb9\x89\xe0\xb8\xb2\xe0\xb8\x96\xe0\xb8\xb6\xe0\xb8\x87\xe0\xb8\x82\xe0\xb8\xad\xe0\xb8\x87\xe0\xb9\x80\xe0\xb8\xa7\xe0\xb9\x87\xe0\xb8\x9a\xe0\xb9\x84\xe0\xb8\x8b\xe0\xb8\x95\xe0\xb9\x8c\'};\n $(\'progress\').textContent=finished?(state.status===\'failed\'?\'\xe0\xb8\x87\xe0\xb8\xb2\xe0\xb8\x99\xe0\xb9\x84\xe0\xb8\xa1\xe0\xb9\x88\xe0\xb8\xaa\xe0\xb8\xb3\xe0\xb9\x80\xe0\xb8\xa3\xe0\xb9\x87\xe0\xb8\x88 \xc2\xb7 \'+state.error:\'\xe0\xb8\xad\xe0\xb9\x88\xe0\xb8\xb2\xe0\xb8\x99\xe0\xb9\x81\xe0\xb8\xa5\xe0\xb9\x89\xe0\xb8\xa7 \'+state.pages.length+\' \xe0\xb8\xab\xe0\xb8\x99\xe0\xb9\x89\xe0\xb8\xb2 \xc2\xb7 \xe0\xb9\x84\xe0\xb8\x94\xe0\xb9\x89\xe0\xb9\x80\xe0\xb8\x99\xe0\xb8\xb7\xe0\xb9\x89\xe0\xb8\xad\xe0\xb8\xab\xe0\xb8\xb2 \'+(summary?.succeeded||0)+\' \xe0\xb8\xab\xe0\xb8\x99\xe0\xb9\x89\xe0\xb8\xb2 \xc2\xb7 \'+(reasons[summary?.stop_reason]||state.status)):\'\xe0\xb8\xad\xe0\xb9\x88\xe0\xb8\xb2\xe0\xb8\x99\xe0\xb9\x81\xe0\xb8\xa5\xe0\xb9\x89\xe0\xb8\xa7 \'+state.pages.length+\' \xe0\xb8\xab\xe0\xb8\x99\xe0\xb9\x89\xe0\xb8\xb2 \xc2\xb7 \xe0\xb8\x81\xe0\xb8\xb3\xe0\xb8\xa5\xe0\xb8\xb1\xe0\xb8\x87\xe0\xb8\xad\xe0\xb9\x88\xe0\xb8\xb2\xe0\xb8\x99 \'+state.current_url;\n $(\'cancel\').hidden=finished;$(\'zip\').disabled=!summary;\n if(state.pages.length&&!result)showResult(state.pages[0]);\n return finished;\n}\nasync function run(demo=false){\n const payload={url:$(\'url\').value,scope:$(\'scope\').value,render_js:$(\'renderjs\').checked,max_pages:Number($(\'maxpages\').value),max_depth:Number($(\'depth\').value),path_prefix:$(\'prefix\').value.trim()};\n const crawling=!demo&&$(\'mode\').value===\'crawl\';\n busy(true);result=null;selectedUrl=null;jobState=null;jobId=null;\n for(const id of [\'copy\',\'download\',\'downloadmd\',\'zip\'])$(id).disabled=true;\n for(const id of [\'chars\',\'heads\',\'links\',\'time\',\'title\',\'description\',\'final\',\'canonical\',\'cleanup\'])$(id).textContent=\'\xe2\x80\x94\';\n $(\'status\').textContent=\'\xe0\xb8\x81\xe0\xb8\xb3\xe0\xb8\xa5\xe0\xb8\xb1\xe0\xb8\x87\xe0\xb8\xad\xe0\xb9\x88\xe0\xb8\xb2\xe0\xb8\x99\';$(\'content\').textContent=\'\xe0\xb8\x81\xe0\xb8\xb3\xe0\xb8\xa5\xe0\xb8\xb1\xe0\xb8\x87\xe0\xb8\xad\xe0\xb9\x88\xe0\xb8\xb2\xe0\xb8\x99\xe0\xb9\x80\xe0\xb8\xa7\xe0\xb9\x87\xe0\xb8\x9a\xe0\xb9\x84\xe0\xb8\x8b\xe0\xb8\x95\xe0\xb9\x8c\xe2\x80\xa6\';$(\'job\').hidden=!crawling;$(\'pagelist\').replaceChildren();$(\'progress\').textContent=\'\xe0\xb8\x81\xe0\xb8\xb3\xe0\xb8\xa5\xe0\xb8\xb1\xe0\xb8\x87\xe0\xb9\x80\xe0\xb8\xa3\xe0\xb8\xb4\xe0\xb9\x88\xe0\xb8\xa1\xe0\xb8\x87\xe0\xb8\xb2\xe0\xb8\x99\xe2\x80\xa6\';$(\'cancel\').hidden=false;$(\'cancel\').disabled=false;\n $(\'cancel\').textContent=\'\xe0\xb8\xab\xe0\xb8\xa2\xe0\xb8\xb8\xe0\xb8\x94\xe0\xb8\xab\xe0\xb8\xa5\xe0\xb8\xb1\xe0\xb8\x87\xe0\xb8\xab\xe0\xb8\x99\xe0\xb9\x89\xe0\xb8\xb2\xe0\xb8\x9b\xe0\xb8\xb1\xe0\xb8\x88\xe0\xb8\x88\xe0\xb8\xb8\xe0\xb8\x9a\xe0\xb8\xb1\xe0\xb8\x99\';\n message(demo?\'\xe0\xb8\x81\xe0\xb8\xb3\xe0\xb8\xa5\xe0\xb8\xb1\xe0\xb8\x87\xe0\xb8\xad\xe0\xb9\x88\xe0\xb8\xb2\xe0\xb8\x99\xe0\xb8\x95\xe0\xb8\xb1\xe0\xb8\xa7\xe0\xb8\xad\xe0\xb8\xa2\xe0\xb9\x88\xe0\xb8\xb2\xe0\xb8\x87\xe0\xb9\x83\xe0\xb8\x99\xe0\xb9\x80\xe0\xb8\x84\xe0\xb8\xa3\xe0\xb8\xb7\xe0\xb9\x88\xe0\xb8\xad\xe0\xb8\x87\xe2\x80\xa6\':payload.render_js?\'\xe0\xb8\x81\xe0\xb8\xb3\xe0\xb8\xa5\xe0\xb8\xb1\xe0\xb8\x87\xe0\xb9\x80\xe0\xb8\x9b\xe0\xb8\xb4\xe0\xb8\x94\xe0\xb8\xab\xe0\xb8\x99\xe0\xb9\x89\xe0\xb8\xb2\xe0\xb9\x80\xe0\xb8\xa7\xe0\xb9\x87\xe0\xb8\x9a\xe0\xb8\x94\xe0\xb9\x89\xe0\xb8\xa7\xe0\xb8\xa2 Edge \xe0\xb9\x83\xe0\xb8\x99\xe0\xb9\x80\xe0\xb8\x84\xe0\xb8\xa3\xe0\xb8\xb7\xe0\xb9\x88\xe0\xb8\xad\xe0\xb8\x87 \xe0\xb8\xad\xe0\xb8\xb2\xe0\xb8\x88\xe0\xb9\x83\xe0\xb8\x8a\xe0\xb9\x89\xe0\xb9\x80\xe0\xb8\xa7\xe0\xb8\xa5\xe0\xb8\xb2\xe0\xb8\x99\xe0\xb8\xb2\xe0\xb8\x99\xe0\xb8\x81\xe0\xb8\xa7\xe0\xb9\x88\xe0\xb8\xb2\xe0\xb9\x82\xe0\xb8\xab\xe0\xb8\xa1\xe0\xb8\x94 HTML\':\'\xe0\xb8\x81\xe0\xb8\xb3\xe0\xb8\xa5\xe0\xb8\xb1\xe0\xb8\x87\xe0\xb8\x95\xe0\xb8\xa3\xe0\xb8\xa7\xe0\xb8\x88 robots.txt \xe0\xb9\x81\xe0\xb8\xa5\xe0\xb8\xb0\xe0\xb8\xad\xe0\xb9\x88\xe0\xb8\xb2\xe0\xb8\x99\xe0\xb9\x80\xe0\xb8\xa7\xe0\xb9\x87\xe0\xb8\x9a\xe0\xb9\x84\xe0\xb8\x8b\xe0\xb8\x95\xe0\xb9\x8c\xe2\x80\xa6\');\n try{\n  if(!crawling){showResult(await api(demo?\'/api/demo\':\'/api/scrape\',payload));return}\n  const started=await api(\'/api/crawl\',payload);jobId=started.job_id;\n  while(true){const state=await api(\'/api/jobs/\'+jobId);if(renderJob(state))break;await new Promise(resolve=>setTimeout(resolve,1000))}\n }catch(e){message(e.message);$(\'status\').textContent=\'\xe0\xb9\x84\xe0\xb8\xa1\xe0\xb9\x88\xe0\xb8\xaa\xe0\xb8\xb3\xe0\xb9\x80\xe0\xb8\xa3\xe0\xb9\x87\xe0\xb8\x88\';if(!result)$(\'content\').textContent=\'\xe0\xb8\xa2\xe0\xb8\xb1\xe0\xb8\x87\xe0\xb9\x84\xe0\xb8\xa1\xe0\xb9\x88\xe0\xb8\xa1\xe0\xb8\xb5\xe0\xb8\x9c\xe0\xb8\xa5 \xe0\xb8\x81\xe0\xb8\xa3\xe0\xb8\xb8\xe0\xb8\x93\xe0\xb8\xb2\xe0\xb8\x95\xe0\xb8\xa3\xe0\xb8\xa7\xe0\xb8\x88 URL \xe0\xb9\x81\xe0\xb8\xa5\xe0\xb8\xb0\xe0\xb8\xa5\xe0\xb8\xad\xe0\xb8\x87\xe0\xb8\xad\xe0\xb8\xb5\xe0\xb8\x81\xe0\xb8\x84\xe0\xb8\xa3\xe0\xb8\xb1\xe0\xb9\x89\xe0\xb8\x87\';$(\'cancel\').hidden=true}\n finally{busy(false)}\n}\nfunction saveBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement(\'a\');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}\nfunction markdownDocument(page){return \'---\\nurl: \'+JSON.stringify(page.final_url||page.url)+\'\\ntitle: \'+JSON.stringify(page.title||\'\')+\'\\nstatus: \'+JSON.stringify(page.status)+\'\\n---\\n\\n\'+(page.markdown||\'\')+\'\\n\'}\n$(\'form\').addEventListener(\'submit\',e=>{e.preventDefault();run()});$(\'demo\').onclick=()=>run(true);\n$(\'mode\').onchange=()=>{$(\'crawloptions\').hidden=$(\'mode\').value!==\'crawl\'};\n$(\'sample\').onclick=()=>{$(\'url\').value=\'https://www.bot.or.th/th/home.html\';$(\'mode\').value=\'crawl\';$(\'scope\').value=\'page\';$(\'maxpages\').value=\'5\';$(\'depth\').value=\'2\';$(\'prefix\').value=\'/th/news-and-media/\';$(\'crawloptions\').hidden=false;message(\'\xe0\xb8\x95\xe0\xb8\xb1\xe0\xb9\x89\xe0\xb8\x87\xe0\xb8\x84\xe0\xb9\x88\xe0\xb8\xb2\xe0\xb8\xad\xe0\xb9\x88\xe0\xb8\xb2\xe0\xb8\x99\xe0\xb8\xab\xe0\xb8\x99\xe0\xb9\x89\xe0\xb8\xb2\xe0\xb9\x81\xe0\xb8\xa3\xe0\xb8\x81\xe0\xb9\x81\xe0\xb8\xa5\xe0\xb8\xb0\xe0\xb8\xab\xe0\xb8\x99\xe0\xb9\x89\xe0\xb8\xb2\xe0\xb8\xa5\xe0\xb8\xb9\xe0\xb8\x81\xe0\xb8\xab\xe0\xb8\xa1\xe0\xb8\xa7\xe0\xb8\x94\xe0\xb8\x82\xe0\xb9\x88\xe0\xb8\xb2\xe0\xb8\xa7\xe0\xb8\xa3\xe0\xb8\xa7\xe0\xb8\xa1\xe0\xb9\x84\xe0\xb8\xa1\xe0\xb9\x88\xe0\xb9\x80\xe0\xb8\x81\xe0\xb8\xb4\xe0\xb8\x99 5 \xe0\xb8\xab\xe0\xb8\x99\xe0\xb9\x89\xe0\xb8\xb2\xe0\xb9\x81\xe0\xb8\xa5\xe0\xb9\x89\xe0\xb8\xa7 \xe0\xb8\x81\xe0\xb8\x94\xe0\xb9\x80\xe0\xb8\xa3\xe0\xb8\xb4\xe0\xb9\x88\xe0\xb8\xa1\xe0\xb8\xad\xe0\xb9\x88\xe0\xb8\xb2\xe0\xb8\x99\xe0\xb9\x80\xe0\xb8\x9e\xe0\xb8\xb7\xe0\xb9\x88\xe0\xb8\xad\xe0\xb8\x97\xe0\xb8\x94\xe0\xb8\xa5\xe0\xb8\xad\xe0\xb8\x87\')};\ndocument.querySelectorAll(\'[data-tab]\').forEach(button=>button.onclick=()=>{tab=button.dataset.tab;document.querySelectorAll(\'[data-tab]\').forEach(b=>{b.classList.toggle(\'active\',b===button);b.setAttribute(\'aria-selected\',String(b===button))});render()});\n$(\'copy\').onclick=async()=>{try{await navigator.clipboard.writeText(tab===\'markdown\'?result.markdown:result.text);message(\'\xe0\xb8\x84\xe0\xb8\xb1\xe0\xb8\x94\xe0\xb8\xa5\xe0\xb8\xad\xe0\xb8\x81\xe0\xb9\x81\xe0\xb8\xa5\xe0\xb9\x89\xe0\xb8\xa7\',true)}catch{message(\'\xe0\xb8\x81\xe0\xb8\xa3\xe0\xb8\xb8\xe0\xb8\x93\xe0\xb8\xb2\xe0\xb9\x80\xe0\xb8\xa5\xe0\xb8\xb7\xe0\xb8\xad\xe0\xb8\x81\xe0\xb8\x82\xe0\xb9\x89\xe0\xb8\xad\xe0\xb8\x84\xe0\xb8\xa7\xe0\xb8\xb2\xe0\xb8\xa1\xe0\xb9\x81\xe0\xb8\xa5\xe0\xb9\x89\xe0\xb8\xa7\xe0\xb8\x84\xe0\xb8\xb1\xe0\xb8\x94\xe0\xb8\xa5\xe0\xb8\xad\xe0\xb8\x81\xe0\xb8\x94\xe0\xb9\x89\xe0\xb8\xa7\xe0\xb8\xa2\xe0\xb8\x95\xe0\xb8\xb1\xe0\xb8\xa7\xe0\xb9\x80\xe0\xb8\xad\xe0\xb8\x87\')}};\n$(\'download\').onclick=()=>saveBlob(new Blob([JSON.stringify(result,null,2)],{type:\'application/json;charset=utf-8\'}),\'crawler-result.json\');\n$(\'downloadmd\').onclick=()=>saveBlob(new Blob([markdownDocument(result)],{type:\'text/markdown;charset=utf-8\'}),\'crawler-page.md\');\n$(\'cancel\').onclick=async()=>{if(!jobId)return;try{await api(\'/api/cancel\',{job_id:jobId});$(\'cancel\').disabled=true;$(\'cancel\').textContent=\'\xe0\xb8\x88\xe0\xb8\xb0\xe0\xb8\xab\xe0\xb8\xa2\xe0\xb8\xb8\xe0\xb8\x94\xe0\xb8\xab\xe0\xb8\xa5\xe0\xb8\xb1\xe0\xb8\x87\xe0\xb8\xab\xe0\xb8\x99\xe0\xb9\x89\xe0\xb8\xb2\xe0\xb8\x9b\xe0\xb8\xb1\xe0\xb8\x88\xe0\xb8\x88\xe0\xb8\xb8\xe0\xb8\x9a\xe0\xb8\xb1\xe0\xb8\x99\'}catch(e){message(e.message)}};\n$(\'zip\').onclick=async()=>{try{const response=await fetch(\'/api/jobs/\'+jobId+\'/download\',{headers:{\'X-Local-Token\':token}});if(!response.ok)throw Error(\'\xe0\xb8\x94\xe0\xb8\xb2\xe0\xb8\xa7\xe0\xb8\x99\xe0\xb9\x8c\xe0\xb9\x82\xe0\xb8\xab\xe0\xb8\xa5\xe0\xb8\x94\xe0\xb9\x84\xe0\xb8\xa1\xe0\xb9\x88\xe0\xb8\xaa\xe0\xb8\xb3\xe0\xb9\x80\xe0\xb8\xa3\xe0\xb9\x87\xe0\xb8\x88\');saveBlob(await response.blob(),\'crawler-pages.zip\')}catch(e){message(e.message)}};\n'

"""Local web UI: python scraper/web.py (open http://127.0.0.1:8765)."""
import argparse
import ipaddress
import json
import secrets
import socket
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import build_opener, HTTPRedirectHandler

# Core included above
ARTICLE = '<!doctype html><html lang="th"><head><meta charset="utf-8">\n<title>คู่มือ SEO สำหรับร้านกาแฟ</title>\n<meta name="description" content="ตัวอย่างบทความภาษาไทยสำหรับทดสอบ scraper">\n<link rel="canonical" href="/article"></head><body>\n<nav>เมนูที่ไม่ควรติดในเนื้อหาบทความ</nav><main><article>\n<h1>SEO สำหรับร้านกาแฟ</h1><p>ร้านกาแฟสามารถเริ่มทำ SEO ด้วยการอธิบายบริการ\nสถานที่ตั้ง เวลาเปิดปิด และเมนูที่ลูกค้าค้นหา ข้อมูลควรตรงกับการให้บริการจริง\nและมีรายละเอียดเพียงพอให้ลูกค้าตัดสินใจได้</p>\n<h2>เริ่มจากข้อมูลที่ถูกต้อง</h2><p>ตรวจชื่อร้าน ที่อยู่ และช่องทางติดต่อให้ครบถ้วน\nจากนั้นเขียนเนื้อหาให้ตอบคำถามของลูกค้า ใช้หัวข้อที่อ่านง่าย และเชื่อมไปยังหน้าที่เกี่ยวข้อง</p>\n<a href="/menu">ดูเมนู</a></article></main><footer>ส่วนท้ายเว็บไซต์</footer>\n<script>console.log(\'script should not appear\')</script></body></html>'
# Crawler included above
# Browser renderer included above

TOKEN = secrets.token_urlsafe(32)
BUSY = threading.BoundedSemaphore(1)
JOBS = {}
JOBS_LOCK = threading.Lock()


def validate_public_url(url):
    parsed = urlparse(url)
    if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError('กรุณาใช้ URL แบบ http:// หรือ https:// ที่ไม่มีรหัสผ่าน')
    if parsed.port not in (None, 80, 443):
        raise ValueError('รองรับเฉพาะพอร์ตเว็บ 80 และ 443')
    addresses = socket.getaddrinfo(parsed.hostname, parsed.port or (443 if parsed.scheme == 'https' else 80), type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(item[4][0]).is_global for item in addresses):
        raise ValueError('หน้านี้รับเฉพาะ URL เว็บไซต์สาธารณะ')


class CheckedRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validate_public_url(newurl)
        if urlparse(req.full_url).netloc != urlparse(newurl).netloc:
            raise ValueError('เว็บเปลี่ยนโดเมน กรุณาใส่ URL ปลายทางโดยตรงเพื่ออ่าน robots ให้ถูกต้อง')
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def public_fetch(url):
    validate_public_url(url)
    return fetch(url, opener=build_opener(CheckedRedirect()).open)


def browser_fetch(url):
    if urlparse(url).path == '/robots.txt':
        return public_fetch(url)
    return render_html(url, validator=validate_public_url)


def job_snapshot(job):
    return {key: value for key, value in job.items() if key != 'cancel_event'}


def run_crawl_job(job_id, url, options):
    def update(event):
        with JOBS_LOCK:
            job = JOBS[job_id]
            if 'page' in event:
                job['pages'].append(event.pop('page'))
            job.update(event)
    try:
        with JOBS_LOCK:
            cancel = JOBS[job_id]['cancel_event']
        render = options.pop('render_js')
        result = crawl_site(url, fetcher=browser_fetch if render else public_fetch,
                            on_update=update, cancelled=cancel.is_set, **options)
        with JOBS_LOCK:
            JOBS[job_id].update(status='cancelled' if result['stop_reason'] == 'cancelled' else 'completed', result=result)
    except Exception as exc:
        with JOBS_LOCK:
            JOBS[job_id].update(status='failed', error=str(exc)[:300])
    finally:
        BUSY.release()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def reply(self, status, body, kind='application/json; charset=utf-8'):
        data = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        for key, value in [('Content-Type', kind), ('Content-Length', str(len(data))),
                           ('Cache-Control', 'no-store'), ('X-Content-Type-Options', 'nosniff'),
                           ('X-Frame-Options', 'DENY'), ('Referrer-Policy', 'no-referrer')]:
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(data)

    def valid_host(self):
        return self.headers.get('Host') == f'127.0.0.1:{self.server.server_port}'

    def do_GET(self):
        if not self.valid_host():
            return self.reply(403, {'error': 'Invalid host'})
        if self.path == '/':
            page = WEB_HTML.replace('__TOKEN__', TOKEN)
            return self.reply(200, page.encode('utf-8'), 'text/html; charset=utf-8')
        if self.path == '/health':
            return self.reply(200, {'status': 'ok'})
        if self.path == '/app.js':
            return self.reply(200, WEB_JS, 'text/javascript; charset=utf-8')
        if self.path.startswith('/api/jobs/'):
            if self.headers.get('X-Local-Token') != TOKEN:
                return self.reply(403, {'error': 'กรุณาโหลดหน้าเว็บใหม่'})
            parts = self.path.strip('/').split('/')
            job_id = parts[2] if len(parts) in (3, 4) else ''
            with JOBS_LOCK:
                job = JOBS.get(job_id)
                snapshot = job_snapshot(job) if job else None
            if not snapshot:
                return self.reply(404, {'error': 'ไม่พบงานนี้'})
            if len(parts) == 4 and parts[3] == 'download':
                if not snapshot.get('result'):
                    return self.reply(409, {'error': 'งานยังไม่เสร็จ'})
                return self.reply(200, crawl_zip(snapshot['result']), 'application/zip')
            return self.reply(200, snapshot)
        return self.reply(404, {'error': 'Not found'})

    def do_POST(self):
        if not self.valid_host() or self.headers.get('X-Local-Token') != TOKEN:
            return self.reply(403, {'error': 'กรุณาเปิดหน้าเว็บใหม่แล้วลองอีกครั้ง'})
        if self.path not in ('/api/scrape', '/api/demo', '/api/crawl', '/api/cancel'):
            return self.reply(404, {'error': 'Not found'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 8192:
                return self.reply(400, {'error': 'คำขอไม่ถูกต้องหรือยาวเกินไป'})
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise ValueError('Invalid request')
            if self.path == '/api/cancel':
                with JOBS_LOCK:
                    job = JOBS.get(str(payload.get('job_id', '')))
                    if not job:
                        return self.reply(404, {'error': 'ไม่พบงานนี้'})
                    job['cancel_event'].set()
                return self.reply(200, {'status': 'cancellation_requested'})
            url = payload.get('url', '')
            if not isinstance(url, str) or len(url) > 2048:
                raise ValueError('URL ไม่ถูกต้อง')
            scope = payload.get('scope', 'main')
            render_js = payload.get('render_js', False)
            if scope not in ('main', 'page') or type(render_js) is not bool:
                raise ValueError('ตัวเลือกอ่านหน้าเว็บไม่ถูกต้อง')
            options = None
            if self.path == '/api/crawl':
                max_pages, max_depth = payload.get('max_pages', 5), payload.get('max_depth', 2)
                path_prefix = payload.get('path_prefix', '')
                if type(max_pages) is not int or not 1 <= max_pages <= 10 or type(max_depth) is not int or not 0 <= max_depth <= 3:
                    raise ValueError('รองรับ 1–10 หน้า และความลึก 0–3')
                if not isinstance(path_prefix, str) or len(path_prefix) > 300:
                    raise ValueError('ขอบเขตเส้นทางไม่ถูกต้อง')
                options = dict(max_pages=max_pages, max_depth=max_depth, path_prefix=path_prefix, scope=scope, render_js=render_js)
            if not BUSY.acquire(blocking=False):
                return self.reply(429, {'error': 'กำลังอ่านอีกหน้าอยู่ กรุณารอสักครู่'})
            if self.path == '/api/crawl':
                job_id = secrets.token_hex(12)
                with JOBS_LOCK:
                    for old_id in list(JOBS):
                        if len(JOBS) < 5:
                            break
                        if JOBS[old_id]['status'] != 'running':
                            del JOBS[old_id]
                    JOBS[job_id] = {'id': job_id, 'status': 'running', 'pages': [],
                                    'current_url': url, 'attempted': 0, 'cancel_event': threading.Event()}
                threading.Thread(target=run_crawl_job, args=(job_id, url.strip(), options), daemon=True).start()
                return self.reply(202, {'job_id': job_id})
            try:
                if self.path == '/api/demo':
                    result = extract(ARTICLE, 'https://demo.example/article', scope=scope)
                    result.update(url='https://demo.example/article', elapsed_seconds=0, mode='demo')
                else:
                    result = scrape(url.strip(), fetcher=browser_fetch if render_js else public_fetch, scope=scope)
                    result['mode'] = 'live'
                    result['render_js'] = render_js
                return self.reply(200, result)
            finally:
                BUSY.release()
        except (ValueError, UnicodeError) as exc:
            return self.reply(400, {'error': str(exc)})
        except Exception:
            return self.reply(500, {'error': 'อ่านหน้าเว็บไม่สำเร็จ กรุณาลองอีกครั้ง'})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8765)
    args = parser.parse_args()
    class LocalServer(ThreadingHTTPServer):
        allow_reuse_address = False

        def server_bind(self):
            if hasattr(socket, 'SO_EXCLUSIVEADDRUSE'):
                self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
            super().server_bind()
    server = LocalServer(('127.0.0.1', args.port), Handler)
    print(f'Crawler Studio: http://127.0.0.1:{server.server_port}', flush=True)
    print('Press Ctrl+C to stop. Local prototype; no external API.', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
