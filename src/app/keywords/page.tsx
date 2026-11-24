"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ContentAccountBoundary, useContentStore } from "@/components/content-account";
import WorkspaceShell from "@/components/workspace-shell";
import { Badge, Icon, WsTitle } from "@/components/ui-icons";
import {
  buildKeywordRows,
  guessMapping,
  isKeywordSelection,
  isKeywordSet,
  readKeywordFile,
  volumeBounds,
  type ColumnMapping,
  type KeywordMetadata,
  type KeywordSelection,
  type KeywordSet,
  type ParsedKeywordFile,
} from "@/lib/keyword-data";
import styles from "./keywords.module.css";
import { createUuid } from "@/lib/uuid";

type SetEntry = { id: string; name: string; count: number };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function KeywordsPage() {
  return (
    <WorkspaceShell activeRoute="/keywords">
      <ContentAccountBoundary>
        <Suspense fallback={<div className="studio-card"><p>กำลังเปิดคีย์เวิร์ดของคุณ…</p></div>}>
          <KeywordWorkspace />
        </Suspense>
      </ContentAccountBoundary>
    </WorkspaceShell>
  );
}

function KeywordWorkspace() {
  const store = useContentStore();
  const router = useRouter();
  const params = useSearchParams();
  const setParam = params.get("set");
  const activeId = setParam && UUID.test(setParam) ? setParam : "";
  const [sets, setSets] = useState<SetEntry[]>([]);
  const [dataset, setDataset] = useState<KeywordSet | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("volume");
  const [visible, setVisible] = useState(50);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [showImport, setShowImport] = useState(!activeId);
  const [file, setFile] = useState<File | null>(null);
  const [delimiter, setDelimiter] = useState("auto");
  const [parsed, setParsed] = useState<ParsedKeywordFile | null>(null);
  const [headerIndex, setHeaderIndex] = useState(0);
  const [mapping, setMapping] = useState<ColumnMapping>({ keyword: -1, volume: -1, competition: -1 });
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [fromMonth, setFromMonth] = useState("");
  const [toMonth, setToMonth] = useState("");
  const [network, setNetwork] = useState<KeywordMetadata["network"]>("unknown");
  const [importing, setImporting] = useState(false);
  const [reading, setReading] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const fileRevision = useRef(0);
  const listRevision = useRef(0);
  const createLock = useRef(false);
  const importLock = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    setReading(false);
    return () => {
      mounted.current = false;
      fileRevision.current++;
    };
  }, []);

  const loadSets = useCallback(async () => {
    const current = ++listRevision.current;
    try {
      const rows = await store.list("keyword-set:");
      if (current !== listRevision.current) return;
      setSets(
        rows
          .filter((row) => isKeywordSet(row.value.job))
          .map((row) => {
            const value = row.value.job as KeywordSet;
            return { id: value.id, name: value.name, count: value.rows.length };
          })
      );
    } catch (error) {
      if (current === listRevision.current)
        setLoadError(error instanceof Error ? error.message : "โหลดชุดคีย์เวิร์ดไม่ได้");
    }
  }, [store]);

  useEffect(() => {
    void loadSets();
    return () => {
      listRevision.current++;
    };
  }, [loadSets, reload]);

  useEffect(() => {
    let active = true;
    setDataset(null);
    setSelected([]);
    setQuery("");
    setVisible(50);
    setCreateError("");
    setLoadError("");
    if (!activeId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void store
      .load<unknown>(`keyword-set:${activeId}`)
      .then((saved) => {
        if (!active) return;
        if (!saved || !isKeywordSet(saved.job) || saved.job.id !== activeId)
          throw new Error("ไม่พบชุดคีย์เวิร์ดนี้ในบัญชี หรือข้อมูลอ่านไม่ได้");
        setDataset(saved.job);
      })
      .catch((error) => {
        if (active)
          setLoadError(error instanceof Error ? error.message : "เปิดชุดคีย์เวิร์ดไม่ได้");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [activeId, store, reload]);

  const preview = useMemo(() => {
    if (!parsed) return null;
    try {
      return { ...buildKeywordRows(parsed, headerIndex, mapping), error: "" };
    } catch (error) {
      return {
        rows: [],
        duplicates: 0,
        empty: 0,
        error: error instanceof Error ? error.message : "อ่านคอลัมน์ไม่ได้",
      };
    }
  }, [parsed, headerIndex, mapping]);

  const filtered = useMemo(() => {
    const term = query.normalize("NFKC").trim().toLowerCase();
    return (dataset?.rows ?? [])
      .filter((row) => !term || row.keyword.normalize("NFKC").toLowerCase().includes(term))
      .sort((a, b) => {
        if (sort === "name") return a.keyword.localeCompare(b.keyword, "th");
        const av = volumeBounds(a.volume);
        const bv = volumeBounds(b.volume);
        if (!av && !bv) return a.keyword.localeCompare(b.keyword, "th");
        if (!av) return 1;
        if (!bv) return -1;
        return bv.low - av.low || bv.high - av.high || a.keyword.localeCompare(b.keyword, "th");
      });
  }, [dataset, query, sort]);

  const terms = selected
    .map((id) => dataset?.rows.find((row) => row.id === id))
    .filter((row) => row !== undefined);

  async function chooseFile(nextFile: File, nextDelimiter = delimiter) {
    const current = ++fileRevision.current;
    setFile(nextFile);
    setParsed(null);
    setImportMessage("");
    setReading(true);
    if (nextFile !== file) {
      setName(nextFile.name.replace(/\.[^.]+$/, "").slice(0, 120));
      setLocation("");
      setFromMonth("");
      setToMonth("");
      setNetwork("unknown");
    }
    try {
      const result = await readKeywordFile(nextFile, nextDelimiter);
      if (current !== fileRevision.current) return;
      setParsed(result);
      setHeaderIndex(result.headerIndex);
      setMapping(result.mapping);
    } catch (error) {
      if (current === fileRevision.current)
        setImportMessage(error instanceof Error ? error.message : "อ่านไฟล์ไม่ได้");
    } finally {
      if (current === fileRevision.current) setReading(false);
    }
  }

  async function saveImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (importLock.current || !preview?.rows.length || preview.error || !file) return;
    importLock.current = true;
    setImporting(true);
    setImportMessage("");
    try {
      const id = createUuid();
      const value: KeywordSet = {
        kind: "keyword-set-v1",
        id,
        name: name.trim(),
        rows: preview.rows,
        metadata: {
          provider: "google-keyword-planner",
          fileName: file.name.slice(0, 250),
          location: location.trim(),
          fromMonth,
          toMonth,
          network,
          importedAt: new Date().toISOString(),
        },
      };
      if (!isKeywordSet(value))
        throw new Error(
          "กรุณาตั้งชื่อชุดข้อมูล และระบุเดือนเริ่ม–สิ้นสุดให้ครบทั้งคู่ตามลำดับ หรือเว้นทั้งคู่หากไม่ทราบ"
        );
      await store.save(`keyword-set:${id}`, value);
      if (!mounted.current) return;
      await loadSets();
      if (!mounted.current) return;
      setShowImport(false);
      setParsed(null);
      setFile(null);
      setImportMessage("บันทึกชุดคีย์เวิร์ดแล้ว");
      router.replace(`/keywords?set=${id}`);
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : "บันทึกชุดคีย์เวิร์ดไม่ได้");
    } finally {
      importLock.current = false;
      setImporting(false);
    }
  }

  function toggle(id: string, checked: boolean) {
    setCreateError("");
    if (checked && selected.length >= 5) {
      setCreateError("เลือกได้สูงสุด 5 คำ รวมคำหลัก");
      return;
    }
    setSelected((previous) =>
      checked ? [...previous, id] : previous.filter((value) => value !== id)
    );
  }

  async function startBrief() {
    if (!dataset || !terms.length || createLock.current) return;
    createLock.current = true;
    setCreating(true);
    setCreateError("");
    try {
      const research: KeywordSelection = {
        setId: dataset.id,
        setName: dataset.name,
        metadata: dataset.metadata,
        terms,
      };
      if (!isKeywordSelection(research))
        throw new Error("ข้อมูลคำที่เลือกไม่ถูกต้อง กรุณาเลือกใหม่");
      const workspace = createUuid();
      await store.save(`brief:business-workspace:${workspace}`, {
        brand: "",
        businessDetails: "",
        topic: terms[0].keyword,
        audience: "",
        selectedUrls: [],
        recommendations: null,
        result: null,
        keywordResearch: research,
      });
      if (mounted.current) router.push(`/content?workspace=${workspace}`);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "เตรียมแผนบทความไม่ได้");
    } finally {
      createLock.current = false;
      setCreating(false);
    }
  }

  function downloadTemplate() {
    const url = URL.createObjectURL(
      new Blob(["\uFEFFKeyword,Avg. monthly searches,Competition\r\n"], {
        type: "text/csv;charset=utf-8",
      })
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "keyword-template.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <>
      <WsTitle
        eyebrow="Keyword Workspace"
        title="จัดการคีย์เวิร์ด"
        body="นำเข้าข้อมูล ค้นหา และเลือกคำที่ต้องการใช้วางแผนบทความ"
        action={
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowImport((value) => !value)}
          >
            <Icon name="upload" size={18} />{" "}
            {showImport ? "ซ่อนส่วนนำเข้า" : "นำเข้าไฟล์ CSV"}
          </button>
        }
      />

      {showImport && (
        <section className="import-panel" aria-label="นำเข้าคีย์เวิร์ด" style={{ marginBottom: 16 }}>
          <div className="import-title">
            <span className="card-icon">
              <Icon name="upload" />
            </span>
            <div>
              <h3>Google Keyword Planner CSV</h3>
              <p>
                รองรับ CSV / TSV สูงสุด 1,000 คำ และ 2 MB การนำเข้าและเลือกคำไม่เรียก AI หรือ API คีย์เวิร์ด
              </p>
            </div>
            <Badge>พร้อมใช้งาน</Badge>
          </div>

          <div className={styles.grid} style={{ marginTop: 18 }}>
            <label className={styles.field}>
              เลือกไฟล์
              <input
                type="file"
                accept=".csv,.tsv,.txt"
                disabled={importing || reading}
                onChange={(event) => {
                  const next = event.target.files?.[0];
                  if (next) void chooseFile(next);
                }}
              />
            </label>
            <label className={styles.field}>
              ตัวคั่นคอลัมน์
              <select
                value={delimiter}
                disabled={importing || reading}
                onChange={(event) => {
                  setDelimiter(event.target.value);
                  if (file) void chooseFile(file, event.target.value);
                }}
              >
                <option value="auto">ตรวจอัตโนมัติ</option>
                <option value={","}>จุลภาค (,)</option>
                <option value={"\t"}>แท็บ</option>
                <option value={";"}>อัฒภาค (;)</option>
              </select>
            </label>
          </div>

          <button type="button" className="btn btn-secondary" onClick={downloadTemplate}>
            <Icon name="download" size={16} /> ดาวน์โหลดหัวตารางตัวอย่าง
          </button>

          {reading && (
            <p role="status" style={{ marginTop: 12, color: "var(--muted)", fontSize: 13 }}>
              กำลังอ่านไฟล์…
            </p>
          )}

          {parsed && (
            <form onSubmit={saveImport} style={{ marginTop: 20 }}>
              <fieldset disabled={importing} style={{ border: 0, padding: 0, margin: 0 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>
                  ตรวจคอลัมน์ก่อนบันทึก
                </h3>
                <label className={styles.field} style={{ marginBottom: 14 }}>
                  แถวหัวตาราง
                  <select
                    value={headerIndex}
                    onChange={(event) => {
                      const index = Number(event.target.value);
                      setHeaderIndex(index);
                      setMapping(guessMapping(parsed.rows[index]));
                    }}
                  >
                    {parsed.rows.slice(0, 40).map((row, index) => (
                      <option key={index} value={index}>
                        แถว {index + 1}: {row.slice(0, 3).join(" · ").slice(0, 150)}
                      </option>
                    ))}
                  </select>
                </label>

                <div className={styles.grid}>
                  {(["keyword", "volume", "competition"] as const).map((key) => (
                    <label key={key} className={styles.field}>
                      {key === "keyword"
                        ? "คอลัมน์คีย์เวิร์ด"
                        : key === "volume"
                          ? "ปริมาณค้นหาเฉลี่ยต่อเดือน"
                          : "การแข่งขันโฆษณา"}
                      <select
                        value={mapping[key]}
                        onChange={(event) =>
                          setMapping((previous) => ({
                            ...previous,
                            [key]: Number(event.target.value),
                          }))
                        }
                      >
                        <option value={-1}>
                          {key === "keyword" ? "เลือกคอลัมน์" : "ไม่เก็บคอลัมน์นี้"}
                        </option>
                        {parsed.rows[headerIndex]?.map((heading, index) => (
                          <option key={index} value={index}>
                            {heading || `คอลัมน์ ${index + 1}`}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>

                {preview?.error ? (
                  <p role="alert" className={styles.notice}>
                    {preview.error}
                  </p>
                ) : (
                  preview && (
                    <>
                      <p className={styles.note}>
                        พร้อมนำเข้า {preview.rows.length} คำ
                        {preview.duplicates > 0
                          ? ` · ข้ามคำซ้ำ ${preview.duplicates} แถว โดยเก็บแถวแรกและไม่รวมปริมาณค้นหา`
                          : ""}
                        {preview.empty > 0 ? ` · ข้ามช่องคีย์เวิร์ดว่าง ${preview.empty} แถว` : ""}
                      </p>
                      <div className={styles.tableWrap}>
                        <table className={styles.table}>
                          <thead>
                            <tr>
                              <th>คีย์เวิร์ด</th>
                              <th>ค้นหาเฉลี่ยต่อเดือน</th>
                              <th>การแข่งขันโฆษณา</th>
                            </tr>
                          </thead>
                          <tbody>
                            {preview.rows.slice(0, 5).map((row) => (
                              <tr key={row.id}>
                                <td>
                                  <b>{row.keyword}</b>
                                </td>
                                <td>{row.volume || "ไม่มีข้อมูล"}</td>
                                <td>{row.adsCompetition || "ไม่มีข้อมูล"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )
                )}

                <h3 style={{ fontSize: 16, fontWeight: 700, margin: "20px 0 6px" }}>
                  ระบุที่มาของข้อมูล
                </h3>
                <p className={styles.note}>
                  ใช้พื้นที่และช่วงเวลาตามที่ตั้งไว้ตอนส่งออก หากไม่ทราบให้เว้นว่าง ระบบจะไม่เดาข้อมูลให้
                </p>
                <div className={styles.grid}>
                  <label className={styles.field}>
                    ชื่อชุดคีย์เวิร์ด
                    <input
                      required
                      maxLength={120}
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                    />
                  </label>
                  <label className={styles.field}>
                    ประเทศ / พื้นที่
                    <input
                      maxLength={200}
                      placeholder="เช่น ประเทศไทย"
                      value={location}
                      onChange={(event) => setLocation(event.target.value)}
                    />
                  </label>
                </div>
                <div className={styles.grid}>
                  <label className={styles.field}>
                    เดือนเริ่มต้น
                    <input
                      type="month"
                      value={fromMonth}
                      onChange={(event) => setFromMonth(event.target.value)}
                    />
                  </label>
                  <label className={styles.field}>
                    เดือนสิ้นสุด
                    <input
                      type="month"
                      value={toMonth}
                      onChange={(event) => setToMonth(event.target.value)}
                    />
                  </label>
                  <label className={styles.field}>
                    เครือข่ายค้นหาต้นทาง
                    <select
                      value={network}
                      onChange={(event) =>
                        setNetwork(event.target.value as KeywordMetadata["network"])
                      }
                    >
                      <option value="unknown">ไม่ทราบ / ไม่ระบุ</option>
                      <option value="google">Google</option>
                      <option value="google-and-partners">Google และพาร์ทเนอร์</option>
                    </select>
                  </label>
                </div>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={!preview?.rows.length || !!preview.error || importing}
                >
                  {importing ? "กำลังบันทึก…" : "บันทึกชุดคีย์เวิร์ด"}
                </button>
              </fieldset>
            </form>
          )}
        </section>
      )}

      {importMessage && (
        <p role="status" className={styles.notice}>
          {importMessage}
        </p>
      )}

      {loadError && (
        <div role="alert" className={styles.notice}>
          <p style={{ margin: "0 0 8px" }}>{loadError}</p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setReload((value) => value + 1)}
          >
            ลองโหลดอีกครั้ง
          </button>
        </div>
      )}

      <section className="import-panel" aria-label="เลือกชุดคีย์เวิร์ด" style={{ marginBottom: 16 }}>
        <label className={styles.field}>
          ชุดคีย์เวิร์ดที่บันทึกไว้
          <select
            value={activeId}
            disabled={creating || importing}
            onChange={(event) =>
              router.replace(event.target.value ? `/keywords?set=${event.target.value}` : "/keywords")
            }
          >
            <option value="">เลือกชุดข้อมูล</option>
            {sets.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.count} คำ
              </option>
            ))}
          </select>
        </label>
        {loading && (
          <p role="status" style={{ marginTop: 10, color: "var(--muted)", fontSize: 13 }}>
            กำลังเปิดชุดข้อมูล…
          </p>
        )}
        {!activeId && !sets.length && (
          <p className={styles.note} style={{ marginBottom: 0 }}>
            เริ่มจากนำเข้าไฟล์ด้านบน แล้วชุดข้อมูลจะเปิดได้จากบัญชีเดียวกันในเบราว์เซอร์อื่น
          </p>
        )}
      </section>

      {dataset && (
        <>
          <div className="selected-keywords" aria-label="คำที่เลือกสำหรับบทความ">
            <div>
              <p className="overline">คำที่เลือก {terms.length}/5</p>
              <h3>ชุดคีย์เวิร์ดสำหรับบทความ</h3>
            </div>
            <div className="selected-chips">
              {terms.length === 0 ? (
                <span style={{ color: "var(--muted)", fontSize: 12 }}>
                  เลือกคีย์เวิร์ดจากตารางด้านล่างได้สูงสุด 5 คำ (คำแรกเป็นคำหลัก)
                </span>
              ) : (
                terms.map((term, index) => (
                  <button
                    type="button"
                    key={term.id}
                    className={index === 0 ? "primary-chip" : ""}
                    disabled={creating}
                    onClick={() => {
                      if (index > 0) {
                        setSelected((previous) => [
                          term.id,
                          ...previous.filter((id) => id !== term.id),
                        ]);
                      }
                    }}
                  >
                    {index === 0 ? "คำหลัก" : "ตั้งเป็นคำหลัก"} · {term.keyword}
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        toggle(term.id, false);
                      }}
                    >
                      ×
                    </span>
                  </button>
                ))
              )}
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!terms.length || creating}
              onClick={() => void startBrief()}
            >
              {creating ? "กำลังเตรียมงาน…" : "ใช้คำที่เลือกวางแผนบทความ"}{" "}
              <Icon name="arrow" size={17} />
            </button>
          </div>

          {createError && (
            <p className={styles.notice} role="alert">
              {createError}
            </p>
          )}

          <div className="table-card" aria-label="ตารางคีย์เวิร์ด">
            <div className="table-tools">
              <div className="search-input">
                <Icon name="search" size={17} />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setVisible(50);
                  }}
                  placeholder="ค้นหาคีย์เวิร์ด..."
                />
              </div>
              <select
                value={sort}
                onChange={(event) => {
                  setSort(event.target.value);
                  setVisible(50);
                }}
              >
                <option value="volume">เรียง: ปริมาณค้นหาสูงสุด</option>
                <option value="name">เรียง: ก–ฮ</option>
              </select>
              <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: "auto" }}>
                {dataset.name} · {filtered.length} คำ
              </span>
            </div>

            <div className="ad-note">
              <Icon name="alert" size={17} />
              <span>
                <b>หมายเหตุ:</b> ค่า “การแข่งขัน” หมายถึงการแข่งขันโฆษณา Google Ads
                ไม่ใช่ความยากในการทำ SEO และไม่รับประกันอันดับ ({dataset.metadata.location || "ไม่ระบุพื้นที่"} ·{" "}
                {dataset.metadata.fromMonth
                  ? `${dataset.metadata.fromMonth} ถึง ${dataset.metadata.toMonth}`
                  : "ไม่ระบุช่วงข้อมูล"}
                )
              </span>
            </div>

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col" style={{ width: 44 }} />
                    <th scope="col">คีย์เวิร์ด</th>
                    <th scope="col">ค้นหาเฉลี่ย/เดือน</th>
                    <th scope="col">การแข่งขันโฆษณา</th>
                    <th scope="col">บทบาท</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, visible).map((row) => {
                    const isSelected = selected.includes(row.id);
                    const isPrimary = selected[0] === row.id;
                    return (
                      <tr key={row.id} className={isSelected ? styles.selectedRow : ""}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`เลือก ${row.keyword}`}
                            checked={isSelected}
                            disabled={creating}
                            onChange={(event) => toggle(row.id, event.target.checked)}
                          />
                        </td>
                        <td>
                          <b>{row.keyword}</b>
                        </td>
                        <td>{row.volume || "ไม่มีข้อมูล"}</td>
                        <td>
                          {row.adsCompetition ? (
                            <Badge tone="gray">{row.adsCompetition}</Badge>
                          ) : (
                            "ไม่มีข้อมูล"
                          )}
                        </td>
                        <td>
                          {isPrimary ? (
                            <Badge tone="blue">คำหลัก</Badge>
                          ) : isSelected ? (
                            "คำประกอบ"
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filtered.length > visible && (
              <div style={{ padding: 16, textAlign: "center" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setVisible((value) => value + 50)}
                >
                  แสดงเพิ่มอีก 50 คำ
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
