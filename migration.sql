
-- =========================================================
-- SEO PLATFORM DATABASE
-- Supabase / PostgreSQL
-- =========================================================

-- 1. PROJECTS
-- เก็บโปรเจกต์และเว็บไซต์ของผู้ใช้งาน

CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    website_url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- ใช้สำหรับตรวจสอบว่า project เป็นของ user คนใด
    CONSTRAINT projects_id_user_unique UNIQUE (id, user_id)
);


-- 2. CRAWL_JOBS
-- เก็บงาน Crawl เว็บไซต์

CREATE TABLE IF NOT EXISTS public.crawl_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    project_id UUID NOT NULL
        REFERENCES public.projects(id) ON DELETE CASCADE,

    seed_url TEXT NOT NULL,

    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN (
            'queued',
            'running',
            'completed',
            'failed',
            'cancelled'
        )),

    max_pages INT NOT NULL DEFAULT 5
        CHECK (max_pages BETWEEN 1 AND 10),

    max_depth INT NOT NULL DEFAULT 2
        CHECK (max_depth BETWEEN 0 AND 3),

    render_js BOOLEAN NOT NULL DEFAULT FALSE,

    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    error_message TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    worker_job_id UUID,
    current_url TEXT,

    attempted INT NOT NULL DEFAULT 0,

    result_summary JSONB NOT NULL DEFAULT '{}'::JSONB
);


-- 3. CRAWL_PAGES
-- เก็บผลลัพธ์ที่ได้จากแต่ละหน้าเว็บไซต์

CREATE TABLE IF NOT EXISTS public.crawl_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    crawl_job_id UUID NOT NULL
        REFERENCES public.crawl_jobs(id) ON DELETE CASCADE,

    url TEXT NOT NULL,
    final_url TEXT,

    status TEXT,

    http_status INT
        CHECK (
            http_status IS NULL
            OR http_status BETWEEN 100 AND 599
        ),

    title TEXT,
    description TEXT,
    canonical TEXT,

    text_content TEXT,
    markdown TEXT,

    headings JSONB NOT NULL DEFAULT '[]'::JSONB,
    links JSONB NOT NULL DEFAULT '[]'::JSONB,
    warnings JSONB NOT NULL DEFAULT '[]'::JSONB,

    fetched_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    raw_result JSONB NOT NULL DEFAULT '{}'::JSONB,

    CONSTRAINT crawl_pages_job_url_unique UNIQUE (crawl_job_id, url)
);


-- 4. CONTENT_BRIEFS
-- เก็บข้อมูล Content Brief

CREATE TABLE IF NOT EXISTS public.content_briefs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL
        REFERENCES auth.users(id) ON DELETE CASCADE,

    project_id UUID,

    crawl_job_id UUID
        REFERENCES public.crawl_jobs(id) ON DELETE SET NULL,

    storage_key TEXT NOT NULL
        CHECK (
            LENGTH(TRIM(storage_key)) > 0
            AND LENGTH(storage_key) <= 2048
        ),

    payload JSONB NOT NULL DEFAULT '{}'::JSONB
        CHECK (JSONB_TYPEOF(payload) = 'object'),

    version BIGINT NOT NULL DEFAULT 1,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT content_briefs_project_owner_fk
        FOREIGN KEY (project_id, user_id)
        REFERENCES public.projects(id, user_id)
        ON DELETE CASCADE
);


-- 5. ARTICLES
-- เก็บบทความและสถานะการตรวจทาน

CREATE TABLE IF NOT EXISTS public.articles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL
        REFERENCES auth.users(id) ON DELETE CASCADE,

    project_id UUID,

    storage_key TEXT NOT NULL
        CHECK (
            LENGTH(TRIM(storage_key)) > 0
            AND LENGTH(storage_key) <= 2048
        ),

    payload JSONB NOT NULL
        CHECK (JSONB_TYPEOF(payload) = 'object'),

    title TEXT,

    status TEXT
        CHECK (
            status IS NULL
            OR status IN ('draft', 'ready_for_review')
        ),

    version BIGINT NOT NULL DEFAULT 1,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT articles_project_owner_fk
        FOREIGN KEY (project_id, user_id)
        REFERENCES public.projects(id, user_id)
        ON DELETE CASCADE
);


-- =========================================================
-- 6. INDEXES
-- เพิ่มประสิทธิภาพในการค้นหาข้อมูล
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_projects_user_id
    ON public.projects(user_id);

CREATE INDEX IF NOT EXISTS idx_crawl_jobs_project_id
    ON public.crawl_jobs(project_id);

CREATE INDEX IF NOT EXISTS idx_crawl_jobs_status
    ON public.crawl_jobs(status);

CREATE INDEX IF NOT EXISTS idx_crawl_pages_crawl_job_id
    ON public.crawl_pages(crawl_job_id);

CREATE INDEX IF NOT EXISTS idx_content_briefs_user_id
    ON public.content_briefs(user_id);

CREATE INDEX IF NOT EXISTS idx_content_briefs_project_id
    ON public.content_briefs(project_id);

CREATE INDEX IF NOT EXISTS idx_content_briefs_crawl_job_id
    ON public.content_briefs(crawl_job_id);

CREATE INDEX IF NOT EXISTS idx_articles_user_id
    ON public.articles(user_id);

CREATE INDEX IF NOT EXISTS idx_articles_project_id
    ON public.articles(project_id);


-- =========================================================
-- 7. UPDATED_AT TRIGGER
-- อัปเดตเวลาอัตโนมัติเมื่อมีการแก้ไขข้อมูล
-- =========================================================

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_content_briefs_updated_at
    ON public.content_briefs;

CREATE TRIGGER trigger_content_briefs_updated_at
BEFORE UPDATE ON public.content_briefs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();


DROP TRIGGER IF EXISTS trigger_articles_updated_at
    ON public.articles;

CREATE TRIGGER trigger_articles_updated_at
BEFORE UPDATE ON public.articles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();


-- =========================================================
-- 8. ENABLE ROW LEVEL SECURITY (RLS)
-- =========================================================

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crawl_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crawl_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;


-- =========================================================
-- 9. PROJECTS POLICIES
-- ผู้ใช้เข้าถึงได้เฉพาะโปรเจกต์ของตัวเอง
-- =========================================================

DROP POLICY IF EXISTS projects_owner_access
    ON public.projects;

CREATE POLICY projects_owner_access
ON public.projects
FOR ALL
TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));


-- =========================================================
-- 10. CRAWL_JOBS POLICIES
-- ตรวจสอบเจ้าของผ่าน projects
-- =========================================================

DROP POLICY IF EXISTS crawl_jobs_owner_access
    ON public.crawl_jobs;

CREATE POLICY crawl_jobs_owner_access
ON public.crawl_jobs
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.projects p
        WHERE p.id = crawl_jobs.project_id
        AND p.user_id = (SELECT auth.uid())
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.projects p
        WHERE p.id = crawl_jobs.project_id
        AND p.user_id = (SELECT auth.uid())
    )
);


-- =========================================================
-- 11. CRAWL_PAGES POLICIES
-- ผู้ใช้ดูผล Crawl ได้เฉพาะเว็บไซต์ของตัวเอง
-- การเขียนข้อมูลทำผ่าน Backend / Service Role
-- =========================================================

DROP POLICY IF EXISTS crawl_pages_owner_select
    ON public.crawl_pages;

CREATE POLICY crawl_pages_owner_select
ON public.crawl_pages
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.crawl_jobs j
        JOIN public.projects p
            ON p.id = j.project_id
        WHERE j.id = crawl_pages.crawl_job_id
        AND p.user_id = (SELECT auth.uid())
    )
);


-- =========================================================
-- 12. CONTENT_BRIEFS POLICIES
-- =========================================================

DROP POLICY IF EXISTS content_briefs_owner_access
    ON public.content_briefs;

CREATE POLICY content_briefs_owner_access
ON public.content_briefs
FOR ALL
TO authenticated
USING (
    user_id = (SELECT auth.uid())
)
WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (
        crawl_job_id IS NULL
        OR EXISTS (
            SELECT 1
            FROM public.crawl_jobs j
            JOIN public.projects p
                ON p.id = j.project_id
            WHERE j.id = content_briefs.crawl_job_id
            AND p.user_id = (SELECT auth.uid())
        )
    )
);


-- =========================================================
-- 13. ARTICLES POLICIES
-- =========================================================

DROP POLICY IF EXISTS articles_owner_access
    ON public.articles;

CREATE POLICY articles_owner_access
ON public.articles
FOR ALL
TO authenticated
USING (
    user_id = (SELECT auth.uid())
)
WITH CHECK (
    user_id = (SELECT auth.uid())
);


-- =========================================================
-- END OF SEO PLATFORM DATABASE
-- =========================================================
