"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import WorkspaceShell from "@/components/workspace-shell";
import { Badge, Icon, WsTitle } from "@/components/ui-icons";
import { useProjectAccount } from "@/lib/use-project-account";

type Project = {
  id: string;
  name: string;
  websiteUrl: string;
};

type ProjectRow = {
  id: string;
  name: string;
  website_url: string;
};

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    websiteUrl: row.website_url,
  };
}

export default function ProjectsPage() {
  const {
    client,
    userId,
    checking,
    error: accountError,
  } = useProjectAccount();

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [name, setName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [notice, setNotice] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const sequence = useRef(0);
  const lock = useRef(false);

  const ready = loaded && !checking && Boolean(userId);
  const message = accountError || notice;

  useEffect(() => {
    const request = ++sequence.current;

    setProjects([]);
    setSelectedId("");
    setLoaded(false);
    setNotice("");
    setSaving(false);

    if (!client || !userId) return;

    void client
      .from("projects")
      .select("id, name, website_url")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .then(
        ({ data, error }) => {
          if (request !== sequence.current) return;

          if (error) {
            setNotice(`โหลดโปรเจกต์ไม่ได้: ${error.message}`);
          } else {
            const list = (data ?? []).map(toProject);
            setProjects(list);
            if (list.length > 0) setSelectedId(list[0].id);
          }

          setLoaded(true);
        },
        () => {
          if (request === sequence.current) {
            setNotice("ติดต่อฐานข้อมูลไม่ได้ กรุณารีโหลดแล้วลองใหม่");
            setLoaded(true);
          }
        }
      );

    return () => {
      if (request === sequence.current) sequence.current++;
    };
  }, [client, userId]);

  async function handleAddProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!client || !userId || !ready || lock.current) return;

    const projectName = name.trim();
    const inputUrl = websiteUrl.trim();

    if (!projectName || !inputUrl) {
      setNotice("กรุณากรอกชื่อโปรเจกต์และเว็บไซต์");
      return;
    }

    let normalizedUrl: string;

    try {
      const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(inputUrl);
      const url = new URL(hasScheme ? inputUrl : `https://${inputUrl}`);

      if (
        !["http:", "https:"].includes(url.protocol) ||
        !url.hostname ||
        url.username ||
        url.password
      ) {
        throw new Error("Invalid URL");
      }

      url.hash = "";
      normalizedUrl = url.href;
    } catch {
      setNotice("กรุณาใส่เว็บไซต์ให้ถูกต้อง เช่น https://example.com");
      return;
    }

    if (projects.some((project) => project.websiteUrl === normalizedUrl)) {
      setNotice("เว็บไซต์นี้อยู่ในรายการแล้ว");
      return;
    }

    lock.current = true;
    setSaving(true);
    setNotice("");

    const request = sequence.current;

    try {
      const { data, error } = await client
        .from("projects")
        .insert({
          user_id: userId,
          name: projectName,
          website_url: normalizedUrl,
        })
        .select("id, name, website_url")
        .single();

      if (request !== sequence.current) return;
      if (error) throw new Error(error.message);
      if (!data) throw new Error("ไม่ได้รับข้อมูลโปรเจกต์ที่บันทึก");

      const project = toProject(data);

      setProjects((previous) => [project, ...previous]);
      setSelectedId(project.id);
      setName("");
      setWebsiteUrl("");
      setNotice("บันทึกโปรเจกต์เข้าบัญชีของคุณแล้ว");
    } catch (error) {
      if (request === sequence.current) {
        setNotice(
          error instanceof Error ? error.message : "บันทึกโปรเจกต์ไม่ได้"
        );
      }
    } finally {
      lock.current = false;
      if (request === sequence.current) setSaving(false);
    }
  }

  async function handleDeleteProject(project: Project) {
    if (!client || !userId || !ready || lock.current) return;

    const confirmed = window.confirm(
      `ต้องการลบโปรเจกต์ "${project.name}" และประวัติการอ่านเว็บไซต์ของโปรเจกต์นี้ใช่หรือไม่?`
    );
    if (!confirmed) return;

    lock.current = true;
    setDeletingId(project.id);
    setNotice("");

    const request = sequence.current;

    try {
      const { error } = await client
        .from("projects")
        .delete()
        .eq("id", project.id)
        .eq("user_id", userId);

      if (request !== sequence.current) return;
      if (error) throw new Error(error.message);

      setProjects((previous) => {
        const remaining = previous.filter((item) => item.id !== project.id);
        setSelectedId((current) =>
          current === project.id ? (remaining[0]?.id ?? "") : current
        );
        return remaining;
      });
      setNotice(`ลบโปรเจกต์ "${project.name}" เรียบร้อยแล้ว`);
    } catch (error) {
      if (request === sequence.current) {
        setNotice(
          error instanceof Error ? error.message : "ลบโปรเจกต์ไม่สำเร็จ"
        );
      }
    } finally {
      lock.current = false;
      if (request === sequence.current) setDeletingId(null);
    }
  }

  const activeProject =
    projects.find((p) => p.id === selectedId) ?? projects[0] ?? null;

  return (
    <WorkspaceShell activeRoute="/projects">
      <WsTitle
        eyebrow="Website Projects"
        title="โปรเจกต์เว็บไซต์"
        body="เพิ่มเว็บไซต์เพื่อตรวจโครงสร้าง หรือเริ่มวางแผนจากข้อมูลธุรกิจได้ทันที"
      />

      <div className="project-start">
        <form className="start-card" onSubmit={handleAddProject}>
          <span className="card-icon">
            <Icon name="globe" />
          </span>
          <div>
            <h3>มีเว็บไซต์แล้ว — เพิ่มโปรเจกต์</h3>
            <p>ใส่ URL เพื่อให้ระบบอ่านโครงสร้างและตรวจ SEO เบื้องต้น</p>
            <div className="inline-inputs">
              <input
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="ชื่อโปรเจกต์"
                maxLength={120}
                disabled={!ready || saving}
              />
              <input
                required
                value={websiteUrl}
                onChange={(event) => setWebsiteUrl(event.target.value)}
                placeholder="https://example.com"
                maxLength={2048}
                disabled={!ready || saving}
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!ready || saving}
              >
                <Icon name="plus" size={18} /> {saving ? "กำลังบันทึก…" : "เพิ่ม"}
              </button>
            </div>
            {message && (
              <p
                role="status"
                aria-live="polite"
                style={{
                  marginTop: 12,
                  fontSize: 13,
                  color: accountError ? "#a43d34" : "#087052",
                }}
              >
                {message}
              </p>
            )}
          </div>
        </form>

        <Link href="/content" className="start-card no-site">
          <span className="card-icon">
            <Icon name="spark" />
          </span>
          <div>
            <h3>ยังไม่มีเว็บไซต์?</h3>
            <p>เริ่มจากรายละเอียดธุรกิจ แล้วให้ AI ช่วยแนะนำหัวข้อและวางแผนบทความ</p>
            <span className="linkish">
              เริ่มวางแผนบทความ <Icon name="arrow" size={16} />
            </span>
          </div>
        </Link>
      </div>

      <div className="project-layout">
        <aside className="project-list">
          <div>
            <b>โปรเจกต์ของคุณ</b>
            <Badge tone="gray">{projects.length}</Badge>
          </div>
          {!ready ? (
            <p style={{ padding: 12, fontSize: 13, color: "var(--muted)" }}>
              {accountError ? "กรุณาเข้าสู่ระบบเพื่อดูโปรเจกต์" : "กำลังโหลดข้อมูล…"}
            </p>
          ) : projects.length === 0 ? (
            <p style={{ padding: 12, fontSize: 13, color: "var(--muted)" }}>
              ยังไม่มีโปรเจกต์ เพิ่มเว็บไซต์แรกจากฟอร์มด้านบนได้เลย
            </p>
          ) : (
            projects.map((project) => (
              <button
                type="button"
                key={project.id}
                className={activeProject?.id === project.id ? "active" : ""}
                onClick={() => setSelectedId(project.id)}
              >
                <span>{project.name.slice(0, 2)}</span>
                <div>
                  <b>{project.name}</b>
                  <small>{project.websiteUrl.replace(/^https?:\/\//, "")}</small>
                </div>
              </button>
            ))
          )}
        </aside>

        <section className="project-detail">
          {!ready ? (
            <div className="empty-detail">
              <Icon name="globe" size={38} />
              <h2>{accountError ? "ยังไม่ได้เข้าสู่ระบบ" : "กำลังโหลดโปรเจกต์…"}</h2>
              <p>
                {accountError
                  ? "เข้าสู่ระบบเพื่อจัดการโปรเจกต์เว็บไซต์ ประวัติการอ่านเว็บ และวางแผนบทความ"
                  : "รอสักครู่ กำลังดึงรายการโปรเจกต์จากบัญชีของคุณ"}
              </p>
              {accountError && (
                <Link href="/login" className="btn btn-primary">
                  เข้าสู่ระบบ
                </Link>
              )}
            </div>
          ) : !activeProject ? (
            <div className="empty-detail">
              <Icon name="globe" size={38} />
              <h2>เริ่มต้นด้วยเว็บไซต์แรกของคุณ</h2>
              <p>
                เพิ่มชื่อโปรเจกต์และ URL ด้านบน หรือเลือก “ยังไม่มีเว็บไซต์?” เพื่อวางแผนบทความจากข้อมูลธุรกิจ
              </p>
              <Link href="/content" className="btn btn-secondary">
                เริ่มจากรายละเอียดธุรกิจ <Icon name="arrow" size={16} />
              </Link>
            </div>
          ) : (
            <>
              <div className="detail-head">
                <div>
                  <Badge>พร้อมอ่านโครงสร้างเว็บไซต์</Badge>
                  <h2>{activeProject.name}</h2>
                  <p>{activeProject.websiteUrl}</p>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <Link
                    href={`/projects/${activeProject.id}`}
                    className="btn btn-primary"
                  >
                    เปิดโปรเจกต์ &amp; Crawl <Icon name="arrow" size={17} />
                  </Link>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ color: "#a43d34", borderColor: "#f0c2bc", background: "#fdf2f0" }}
                    disabled={deletingId !== null || saving}
                    onClick={() => void handleDeleteProject(activeProject)}
                  >
                    {deletingId === activeProject.id ? "กำลังลบ…" : "ลบโปรเจกต์"}
                  </button>
                </div>
              </div>

              <div
                style={{
                  marginTop: 24,
                  padding: 20,
                  borderRadius: 12,
                  border: "1px solid var(--line)",
                  background: "#f8faf9",
                  display: "grid",
                  gap: 12,
                }}
              >
                <b>ขั้นตอนการทำงานสำหรับโปรเจกต์นี้</b>
                <p style={{ margin: 0, fontSize: 13, color: "var(--muted)", lineHeight: 1.7 }}>
                  เปิดหน้าโปรเจกต์เพื่อเริ่มอ่านเว็บไซต์ (Crawl), ดูประวัติการอ่านแต่ละรอบ,
                  ตรวจโครงสร้าง SEO เบื้องต้น และดึงหน้าเว็บไปเป็นแหล่งอ้างอิงในการวางแผนบทความ
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 6 }}>
                  <Link
                    href={`/projects/${activeProject.id}`}
                    className="btn btn-secondary"
                  >
                    <Icon name="globe" size={17} /> ดูประวัติและผล Crawl
                  </Link>
                  <Link href="/keywords" className="btn btn-secondary">
                    <Icon name="search" size={17} /> จัดการคีย์เวิร์ด
                  </Link>
                  <Link href="/content" className="btn btn-ghost">
                    วางแผนบทความเลย <Icon name="arrow" size={16} />
                  </Link>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </WorkspaceShell>
  );
}
