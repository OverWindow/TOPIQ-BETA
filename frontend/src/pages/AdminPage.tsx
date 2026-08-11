import {
  Activity, AudioLines, BookOpen, CheckCircle2, ChevronDown, Clock3, Database,
  Headphones, Home, Image, LayoutDashboard, LoaderCircle, LogOut,
  MessageSquareText, Play, RefreshCw, Search, Settings2, ShieldCheck, Trash2,
  Users, XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { adminApi } from "../api";
import { supabase } from "../supabase";
import type {
  AdminListeningGroup, AdminListeningMockTest, AdminReadingItem,
  AdminResponseObservation, AdminResponseSession, AdminSummary, TtsJob, TtsStyle,
} from "../types";

type AdminTab = "overview" | "listening" | "reading" | "responses";
type DeleteDialog = null | { mode: "selected" | "all" };

function AdminLogin({ onReady }: { onReady: (token: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true); setError("");
    try {
      const accessToken = supabase
        ? (await supabase.auth.signInWithPassword({ email, password })).data.session?.access_token
        : (await adminApi.login(email, password)).accessToken;
      if (!accessToken) throw new Error("로그인에 실패했습니다.");
      await adminApi.me(accessToken);
      sessionStorage.setItem("unigate.topik.admin.token", accessToken);
      onReady(accessToken);
    } catch (cause) {
      await supabase?.auth.signOut();
      setError(cause instanceof Error ? cause.message : "관리자 권한이 없습니다.");
    } finally { setLoading(false); }
  };
  return (
    <main className="grid min-h-screen place-items-center bg-[#f4f7fb] p-5">
      <form onSubmit={(event) => void submit(event)} className="w-full max-w-md rounded-[30px] border border-slate-200 bg-white p-8 shadow-[0_24px_70px_rgba(25,45,80,.12)] sm:p-10">
        <div className="grid size-13 place-items-center rounded-2xl bg-[#155fcc] text-white"><ShieldCheck className="size-7" /></div>
        <p className="mt-7 text-xs font-black tracking-[.16em] text-[#155fcc]">UNIGATE TOPIK ADMIN</p>
        <h1 className="mt-2 text-3xl font-black text-slate-900">관리자 로그인</h1>
        <label className="mt-8 block text-sm font-bold text-slate-700">이메일<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="focus-ring mt-2 w-full rounded-xl border border-slate-200 px-4 py-3.5 font-medium" /></label>
        <label className="mt-4 block text-sm font-bold text-slate-700">비밀번호<input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="focus-ring mt-2 w-full rounded-xl border border-slate-200 px-4 py-3.5 font-medium" /></label>
        {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
        <button disabled={loading} className="focus-ring mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#155fcc] px-5 py-4 font-extrabold text-white disabled:opacity-60">{loading && <LoaderCircle className="size-4 animate-spin" />} 로그인</button>
      </form>
    </main>
  );
}

const tabs: Array<{ id: AdminTab; label: string; icon: typeof LayoutDashboard }> = [
  { id: "overview", label: "요약", icon: LayoutDashboard },
  { id: "listening", label: "듣기 문항", icon: Headphones },
  { id: "reading", label: "읽기 문항", icon: BookOpen },
  { id: "responses", label: "사용자 응답", icon: MessageSquareText },
];

const defaultStyle: TtsStyle = { speakingRate: 1, stylePrompt: "" };
const positionLabel = (positions: number[]) => positions.length > 1 ? `${positions[0]}~${positions.at(-1)}` : String(positions[0]);
const formatDuration = (milliseconds: number) => milliseconds < 1000 ? `${milliseconds}ms` : `${(milliseconds / 1000).toFixed(1)}초`;

function Metric({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Database }) {
  return <div className="flex items-center gap-3 py-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-[#155fcc]"><Icon className="size-4" /></span><div><p className="text-xs font-bold text-slate-400">{label}</p><p className="mt-0.5 text-xl font-black text-slate-900">{value.toLocaleString()}</p></div></div>;
}

export function AdminPage() {
  const [token, setToken] = useState<string | null>(null);
  const [tab, setTab] = useState<AdminTab>("overview");
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [items, setItems] = useState<AdminListeningGroup[]>([]);
  const [readingItems, setReadingItems] = useState<AdminReadingItem[]>([]);
  const [responseSessions, setResponseSessions] = useState<AdminResponseSession[]>([]);
  const [responseDetails, setResponseDetails] = useState<Record<string, AdminResponseObservation[]>>({});
  const [responseTotal, setResponseTotal] = useState(0);
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set());
  const [expandedSession, setExpandedSession] = useState("");
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialog>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [jobs, setJobs] = useState<TtsJob[]>([]);
  const [mockTests, setMockTests] = useState<AdminListeningMockTest[]>([]);
  const [status, setStatus] = useState<"" | "ready" | "missing" | "failed">("");
  const [setId, setSetId] = useState("");
  const [readingSetId, setReadingSetId] = useState("");
  const [readingSearch, setReadingSearch] = useState("");
  const [responseSection, setResponseSection] = useState("");
  const [responseCorrectness, setResponseCorrectness] = useState("");
  const [responsePage, setResponsePage] = useState(1);
  const [ttsStyle, setTtsStyle] = useState<TtsStyle>(defaultStyle);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [audioUrl, setAudioUrl] = useState("");

  useEffect(() => {
    const stored = sessionStorage.getItem("unigate.topik.admin.token");
    if (stored) void adminApi.me(stored).then(() => setToken(stored)).catch(() => sessionStorage.removeItem("unigate.topik.admin.token"));
    if (!supabase) return;
    const client = supabase;
    void client.auth.getSession().then(({ data }) => {
      if (data.session) void adminApi.me(data.session.access_token).then(() => setToken(data.session!.access_token)).catch(() => client.auth.signOut());
    });
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      const next = session?.access_token ?? null; setToken(next);
      if (next) sessionStorage.setItem("unigate.topik.admin.token", next);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [dashboard, itemData, jobData, testData, readingData, responseData] = await Promise.all([
        adminApi.dashboard(token),
        adminApi.listeningItems(token, { setId: setId || undefined, status: status || undefined }),
        adminApi.jobs(token), adminApi.mockTests(token), adminApi.readingItems(token),
        adminApi.responseSessions(token, { section: responseSection || undefined, correctness: responseCorrectness || undefined, page: responsePage, pageSize: 20 }),
      ]);
      setSummary(dashboard.summary); setItems(itemData.items); setJobs(jobData.jobs);
      setMockTests(testData.mockTests); setReadingItems(readingData.items);
      setResponseSessions(responseData.sessions); setResponseTotal(responseData.total); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "관리자 데이터를 불러오지 못했습니다."); }
  }, [responseCorrectness, responsePage, responseSection, setId, status, token]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!token || !jobs.some((job) => job.status === "queued" || job.status === "processing")) return;
    const timer = window.setInterval(() => void load(), 4000);
    return () => window.clearInterval(timer);
  }, [jobs, load, token]);

  const listeningSets = useMemo(() => Array.from(new Map(mockTests.map((test) => [test.setId, test])).values()), [mockTests]);
  const readingSets = useMemo(() => Array.from(new Map(readingItems.map((item) => [item.setId, item.mockTestTitle ?? item.setId])).entries()), [readingItems]);
  const visibleReadingItems = useMemo(() => {
    const search = readingSearch.trim().toLocaleLowerCase();
    return readingItems.filter((item) => (!readingSetId || item.setId === readingSetId) && (!search || `${item.position} ${item.itemType} ${item.stem}`.toLocaleLowerCase().includes(search)));
  }, [readingItems, readingSearch, readingSetId]);
  const failedJobs = useMemo(() => {
    const latest = new Map<string, TtsJob>();
    for (const job of jobs) { const key = `${job.itemId}:${job.itemVersion}`; if (!latest.has(key)) latest.set(key, job); }
    return Array.from(latest.values()).filter((job) => job.status === "failed");
  }, [jobs]);
  const pageCount = Math.max(1, Math.ceil(responseTotal / 20));
  const allPageSelected = responseSessions.length > 0 && responseSessions.every((session) => selectedSessions.has(session.sessionId));

  const action = async (key: string, operation: () => Promise<unknown>) => {
    setBusy(key); setError("");
    try { await operation(); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "요청에 실패했습니다."); }
    finally { setBusy(""); }
  };

  const toggleDetails = async (sessionId: string) => {
    if (expandedSession === sessionId) return setExpandedSession("");
    setExpandedSession(sessionId);
    if (!responseDetails[sessionId] && token) {
      try {
        const detail = await adminApi.responseSession(token, sessionId);
        setResponseDetails((current) => ({ ...current, [sessionId]: detail.responses }));
      } catch (cause) { setError(cause instanceof Error ? cause.message : "응답 상세를 불러오지 못했습니다."); }
    }
  };

  const confirmDeletion = async () => {
    if (!token || !deleteDialog) return;
    if (deleteDialog.mode === "all" && deleteConfirmation !== "전체 응답 삭제") return;
    const operation = deleteDialog.mode === "all"
      ? adminApi.deleteAllResponseSessions(token, deleteConfirmation)
      : adminApi.deleteResponseSessions(token, Array.from(selectedSessions));
    await action("delete-responses", () => operation);
    setSelectedSessions(new Set()); setResponseDetails({}); setExpandedSession("");
    setDeleteDialog(null); setDeleteConfirmation("");
  };

  const logout = () => { sessionStorage.removeItem("unigate.topik.admin.token"); setToken(null); void supabase?.auth.signOut(); };
  if (!token) return <AdminLogin onReady={setToken} />;

  return (
    <div className="min-h-screen bg-[#f4f7fb]">
      <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex min-h-18 max-w-[1500px] flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-8"><div><p className="text-xs font-black tracking-[.14em] text-[#155fcc]">UNIGATE</p><h1 className="text-lg font-black text-slate-900">TOPIK 관리자</h1></div><div className="flex gap-2"><Link to="/" className="focus-ring flex items-center gap-2 rounded-xl border border-blue-200 px-4 py-3 text-sm font-extrabold text-[#155fcc]"><Home className="size-4" /> 일반 사이트</Link><button onClick={() => void load()} title="새로고침" className="focus-ring rounded-xl border border-slate-200 p-3 text-slate-600"><RefreshCw className="size-4" /></button><button onClick={logout} className="focus-ring flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white"><LogOut className="size-4" /> 로그아웃</button></div></div></header>
      <main className="mx-auto max-w-[1500px] px-5 py-7 sm:px-8">
        <nav className="mb-7 flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2" aria-label="관리자 메뉴">{tabs.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setTab(id)} className={`focus-ring flex shrink-0 items-center gap-2 rounded-xl px-4 py-3 text-sm font-extrabold ${tab === id ? "bg-[#155fcc] text-white" : "text-slate-600 hover:bg-slate-50"}`}><Icon className="size-4" />{label}</button>)}</nav>
        {error && <p className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}

        {tab === "overview" && summary && <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 p-6 sm:p-8"><p className="text-xs font-black tracking-[.14em] text-[#155fcc]">DASHBOARD</p><h2 className="mt-2 text-2xl font-black">서비스 요약</h2></div><div className="grid divide-y divide-slate-100 lg:grid-cols-3 lg:divide-x lg:divide-y-0"><div className="p-6 sm:p-8"><h3 className="font-black">문제은행</h3><div className="mt-3 grid grid-cols-2"><Metric label="전체 문항" value={summary.totalItems} icon={Database} /><Metric label="전체 세트" value={summary.setCount} icon={LayoutDashboard} /><Metric label="읽기 문항" value={summary.readingVersions} icon={BookOpen} /><Metric label="듣기 문항" value={summary.listeningVersions} icon={Headphones} /></div></div><div className="p-6 sm:p-8"><h3 className="font-black">듣기 자산</h3><div className="mt-3 grid grid-cols-2"><Metric label="준비 음원" value={summary.audioReady} icon={AudioLines} /><Metric label="누락 음원" value={summary.audioMissing} icon={Headphones} /><Metric label="이미지" value={summary.visualReady} icon={Image} /><Metric label="진행 작업" value={summary.jobsQueued + summary.jobsProcessing} icon={Activity} /></div>{failedJobs.length > 0 && <details className="mt-4 rounded-xl bg-red-50 p-3"><summary className="cursor-pointer text-xs font-black text-red-700">최근 실패 {failedJobs.length}건</summary><div className="mt-3 space-y-2">{failedJobs.map((job) => <p key={job.jobId} className="break-all text-xs text-red-700">{job.errorMessage}</p>)}</div></details>}</div><div className="p-6 sm:p-8"><h3 className="font-black">사용자 응답</h3><div className="mt-3 grid grid-cols-2"><Metric label="전체 응답" value={summary.responseCount} icon={MessageSquareText} /><Metric label="실제 응답" value={summary.answeredResponseCount} icon={CheckCircle2} /><Metric label="미응답" value={summary.unansweredResponseCount} icon={XCircle} /><Metric label="오늘 세션" value={summary.sessionsToday} icon={Users} /></div></div></div></section>}

        {tab === "listening" && <><section className="grid gap-5 xl:grid-cols-2">{mockTests.map((test, index) => { const ready = test.audioReady === 50 && test.visualReady >= test.visualRequired; return <article key={test.mockTestId} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-start justify-between gap-4"><div><span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-black text-[#155fcc]">듣기 {index + 1}회</span><h2 className="mt-3 text-xl font-black">{test.titleKo}</h2></div><span className={`rounded-full px-3 py-1.5 text-xs font-black ${test.published ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{test.published ? "공개" : "비공개"}</span></div><div className="mt-5 grid grid-cols-2 gap-3 text-sm"><p className="rounded-xl bg-slate-50 p-3 font-bold">음원 <span className="float-right text-[#155fcc]">{test.audioReady}/50</span></p><p className="rounded-xl bg-slate-50 p-3 font-bold">이미지 <span className="float-right text-[#155fcc]">{test.visualReady}/{test.visualRequired}</span></p></div><div className="mt-4 flex flex-wrap gap-2"><button disabled={Boolean(busy)} onClick={() => void action(`set-${test.setId}`, () => adminApi.generateSet(token, test.setId, test.setVersion, false, ttsStyle))} className="rounded-xl bg-[#155fcc] px-4 py-3 text-sm font-extrabold text-white disabled:opacity-50">누락 음원 일괄 생성</button><button disabled={!ready || Boolean(busy)} onClick={() => void action(`publish-${test.mockTestId}`, () => adminApi.publish(token, test.mockTestId, !test.published))} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-extrabold disabled:opacity-40">{test.published ? "비공개 전환" : "시험 공개"}</button></div></article>; })}</section><section className="mt-6 rounded-3xl border border-blue-100 bg-white p-5 sm:p-7"><div className="flex items-center gap-2"><Settings2 className="size-5 text-[#155fcc]" /><h2 className="text-lg font-black">새 음원 스타일</h2></div><p className="mt-2 text-sm font-medium text-slate-500">이후 생성·재생성하는 공통 음원 그룹에 적용됩니다.</p><div className="mt-5 grid gap-5 lg:grid-cols-[minmax(280px,.7fr)_1.3fr]"><label className="text-sm font-bold text-slate-700">말하기 속도 <span className="ml-2 text-[#155fcc]">{ttsStyle.speakingRate.toFixed(2)}×</span><input type="range" min="0.75" max="1.25" step="0.05" value={ttsStyle.speakingRate} onChange={(event) => setTtsStyle((current) => ({ ...current, speakingRate: Number(event.target.value) }))} className="mt-3 w-full accent-[#155fcc]" /></label><label className="text-sm font-bold text-slate-700">추가 스타일 지시<input maxLength={300} value={ttsStyle.stylePrompt} onChange={(event) => setTtsStyle((current) => ({ ...current, stylePrompt: event.target.value }))} placeholder="차분한 시험 방송처럼 또렷하게 읽어 주세요." className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-medium" /></label></div></section><section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 sm:p-7"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><p className="text-xs font-black tracking-[.14em] text-[#155fcc]">LISTENING BANK</p><h2 className="mt-2 text-2xl font-black">듣기 문항·공통 음원</h2></div><div className="flex gap-2"><select value={setId} onChange={(event) => setSetId(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold"><option value="">전체 세트</option>{listeningSets.map((set, index) => <option key={set.setId} value={set.setId}>듣기 {index + 1}회</option>)}</select><select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold"><option value="">전체 상태</option><option value="ready">음원 준비</option><option value="missing">음원 누락</option><option value="failed">생성 실패</option></select></div></div><div className="mt-6 overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="border-y border-slate-200 bg-slate-50 text-xs font-black text-slate-500"><tr><th className="p-3">번호</th><th className="p-3">유형</th><th className="p-3">공통 대화·질문</th><th className="p-3">음원</th><th className="p-3">그림</th><th className="p-3">작업</th></tr></thead><tbody>{items.map((group) => <tr key={`${group.setId}-${group.positions.join("-")}`} className="border-b border-slate-100 align-top"><td className="p-3"><span className="rounded-xl bg-blue-50 px-3 py-2 font-black text-[#155fcc]">{positionLabel(group.positions)}</span>{group.positions.length > 1 && <span className="mt-2 block text-[10px] font-bold text-slate-400">음원 1개 공유</span>}</td><td className="p-3"><span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold">{group.itemType}</span></td><td className="max-w-lg p-3"><div className="max-h-28 space-y-1 overflow-auto text-xs leading-5">{group.dialogueTurns.map((turn, index) => <p key={index}><b className={turn.speaker === "여자" ? "text-rose-600" : "text-blue-600"}>{turn.speaker}</b> {turn.text}</p>)}</div><div className="mt-2 text-[11px] font-bold text-slate-400">{group.questionPrompts.join(" · ")}</div>{group.lastError && <details className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-700"><summary className="cursor-pointer font-bold">마지막 생성 오류</summary><p className="mt-2 break-all">{group.lastError}</p></details>}</td><td className="p-3">{group.audioAssetId ? <div className="space-y-2"><button onClick={() => void adminApi.audioUrl(token, group.audioAssetId!).then((data) => setAudioUrl(data.audioUrl))} className="flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-2 text-xs font-black text-emerald-700"><Play className="size-3" /> 재생</button><span className="block text-[11px] font-bold text-slate-400">{group.ttsStyle?.speakingRate?.toFixed(2) ?? "1.00"}×</span></div> : <span className="font-bold text-amber-600">{group.audioStatus === "partial" ? "일부 누락" : "누락"}</span>}</td><td className="p-3">{group.targets.some((target) => target.visualOptionCount > 0) ? group.targets.map((target) => target.visualOptionCount > 0 && <div key={target.itemId}><p className="mb-2 text-xs font-bold">{target.position}번 {target.visualReadyCount}/{target.visualOptionCount}</p><div className="flex gap-1">{Array.from({ length: target.visualOptionCount }, (_, index) => <label key={index} className="cursor-pointer rounded-md border border-slate-200 px-2 py-1 text-xs font-bold hover:bg-blue-50">{index + 1}<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void action(`upload-${target.itemId}-${index}`, () => adminApi.uploadVisual(token, target.itemId, target.itemVersion, index + 1, file)); }} /></label>)}</div></div>) : "—"}</td><td className="p-3"><div className="flex flex-wrap gap-2"><button disabled={Boolean(busy)} onClick={() => void action(`group-${group.leaderItemId}`, () => adminApi.generateGroup(token, group.setId, group.setVersion, group.leaderItemId, Boolean(group.audioAssetId), ttsStyle))} className="rounded-lg border border-blue-200 px-3 py-2 text-xs font-black text-[#155fcc] disabled:opacity-50">{group.audioAssetId ? "재생성" : "생성"}</button>{group.audioAssetId && <button disabled={Boolean(busy)} onClick={() => { if (window.confirm(`${positionLabel(group.positions)}번 공통 음원을 삭제할까요?`)) void action(`delete-${group.leaderItemId}`, () => adminApi.deleteGroupAudio(token, group.setId, group.setVersion, group.leaderItemId, group.audioAssetId!)); }} className="flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-xs font-black text-red-600"><Trash2 className="size-3" /> 삭제</button>}</div></td></tr>)}</tbody></table></div></section></>}

        {tab === "reading" && <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-7"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><p className="text-xs font-black tracking-[.14em] text-[#155fcc]">READING BANK</p><h2 className="mt-2 text-2xl font-black">읽기 문제 관리</h2></div><div className="flex flex-wrap gap-2"><select value={readingSetId} onChange={(event) => setReadingSetId(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold"><option value="">전체 세트</option>{readingSets.map(([id, title]) => <option key={id} value={id}>{title}</option>)}</select><label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3"><Search className="size-4 text-slate-400" /><input value={readingSearch} onChange={(event) => setReadingSearch(event.target.value)} placeholder="번호·유형·본문 검색" className="w-48 py-2.5 text-sm font-medium outline-none" /></label></div></div><div className="mt-6 space-y-3">{visibleReadingItems.map((item) => <details key={`${item.setId}-${item.position}`} className="rounded-2xl border border-slate-200 p-4 open:border-blue-200 open:bg-blue-50/30"><summary className="flex cursor-pointer list-none items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#155fcc] text-sm font-black text-white">{item.position}</span><span className="min-w-0 flex-1"><b className="block truncate text-sm">{item.stem}</b><span className="text-xs font-bold text-slate-400">{item.itemType} · {item.mockTestTitle}</span></span><span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-black">정답 {item.correctAnswer ?? "—"}</span></summary><div className="mt-5 grid gap-5 border-t border-slate-200 pt-5 lg:grid-cols-2"><div><p className="whitespace-pre-wrap text-sm font-medium leading-7">{item.stem}</p><ol className="mt-4 space-y-2">{item.choices.map((choice, index) => <li key={index} className={`rounded-xl border px-4 py-3 text-sm font-bold ${item.correctAnswer === index + 1 ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}>{index + 1}. {choice}</li>)}</ol></div><div className="rounded-2xl bg-white p-5"><p className="text-xs font-black text-[#155fcc]">해설</p><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{item.explanation || "등록된 해설이 없습니다."}</p></div></div></details>)}</div></section>}

        {tab === "responses" && <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-7"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><p className="text-xs font-black tracking-[.14em] text-[#155fcc]">RESPONSE DATA</p><h2 className="mt-2 text-2xl font-black">응시 세션별 사용자 응답</h2><p className="mt-2 text-sm font-medium text-slate-500">총 {responseTotal.toLocaleString()}개의 제출 세션</p></div><div className="flex flex-wrap gap-2"><select value={responseSection} onChange={(event) => { setResponseSection(event.target.value); setResponsePage(1); }} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold"><option value="">전체 영역</option><option value="reading">읽기</option><option value="listening">듣기</option></select><select value={responseCorrectness} onChange={(event) => { setResponseCorrectness(event.target.value); setResponsePage(1); }} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold"><option value="">전체 결과</option><option value="correct">정답 포함</option><option value="incorrect">오답 포함</option><option value="unanswered">미응답 포함</option></select><button disabled={!selectedSessions.size} onClick={() => setDeleteDialog({ mode: "selected" })} className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-black text-red-600 disabled:opacity-40">선택 삭제 ({selectedSessions.size})</button><button onClick={() => setDeleteDialog({ mode: "all" })} className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-black text-white">전체 삭제</button></div></div><div className="mt-6 overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="border-y border-slate-200 bg-slate-50 text-xs font-black text-slate-500"><tr><th className="p-3"><input type="checkbox" checked={allPageSelected} onChange={() => setSelectedSessions((current) => { const next = new Set(current); for (const session of responseSessions) allPageSelected ? next.delete(session.sessionId) : next.add(session.sessionId); return next; })} aria-label="현재 페이지 전체 선택" /></th><th className="p-3">제출 시각</th><th className="p-3">시험</th><th className="p-3">점수</th><th className="p-3">실제/미응답</th><th className="p-3">정답/오답</th><th className="p-3">별점</th><th className="p-3">상세</th></tr></thead><tbody>{responseSessions.map((session) => <><tr key={session.sessionId} className="border-b border-slate-100"><td className="p-3"><input type="checkbox" checked={selectedSessions.has(session.sessionId)} onChange={() => setSelectedSessions((current) => { const next = new Set(current); next.has(session.sessionId) ? next.delete(session.sessionId) : next.add(session.sessionId); return next; })} aria-label={`${session.sessionId} 선택`} /></td><td className="p-3 text-xs text-slate-500">{new Date(session.submittedAt).toLocaleString("ko-KR")}</td><td className="p-3"><b className="block text-xs">{session.mockTestTitle}</b><span className="text-xs text-slate-400">{session.mode === "timed" ? "실전" : "연습"}</span></td><td className="p-3 font-black text-[#155fcc]">{session.score}/{session.maxScore}</td><td className="p-3"><b>{session.answeredCount}</b> / <span className="text-amber-600">{session.unansweredCount}</span></td><td className="p-3"><span className="text-emerald-700">{session.correctCount}</span> / <span className="text-red-600">{session.incorrectCount}</span></td><td className="p-3 font-bold">{session.rating ? `${session.rating}점` : "—"}</td><td className="p-3"><button onClick={() => void toggleDetails(session.sessionId)} className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-black">보기 <ChevronDown className={`size-3 transition ${expandedSession === session.sessionId ? "rotate-180" : ""}`} /></button></td></tr>{expandedSession === session.sessionId && <tr key={`${session.sessionId}-detail`}><td colSpan={8} className="bg-slate-50 p-4"><div className="grid grid-cols-2 gap-2 sm:grid-cols-5 lg:grid-cols-10">{responseDetails[session.sessionId]?.map((response) => <div key={response.observationId} className={`rounded-xl border p-3 text-xs ${response.isCorrect ? "border-emerald-200 bg-emerald-50" : response.selectedOption ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}><b className="text-sm">{response.itemOrder}번</b><p className="mt-1 truncate text-slate-500">{response.itemType}</p><p className="mt-2 font-bold">{response.selectedOption ?? "미응답"} → {response.correctAnswer}</p><p className="mt-1 text-[10px] text-slate-400">{formatDuration(response.responseTimeMs)}{response.answerChanged ? " · 변경" : ""}</p></div>) ?? <p className="col-span-full py-6 text-center text-slate-400">불러오는 중...</p>}</div></td></tr>}</>)}</tbody></table></div>{!responseSessions.length && <p className="py-16 text-center text-sm font-bold text-slate-400">응답 세션이 없습니다.</p>}<div className="mt-5 flex items-center justify-end gap-3"><button disabled={responsePage <= 1} onClick={() => setResponsePage((page) => page - 1)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-black disabled:opacity-40">이전</button><span className="text-xs font-bold text-slate-500">{responsePage} / {pageCount}</span><button disabled={responsePage >= pageCount} onClick={() => setResponsePage((page) => page + 1)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-black disabled:opacity-40">다음</button></div></section>}

        {audioUrl && <div className="fixed bottom-5 left-1/2 z-30 flex w-[min(92vw,600px)] -translate-x-1/2 items-center gap-3 rounded-2xl bg-slate-900 p-3 text-white shadow-2xl"><audio src={audioUrl} controls autoPlay className="w-full" /><button onClick={() => setAudioUrl("")} className="px-2 font-black">×</button></div>}
      </main>

      {deleteDialog && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-5"><div role="dialog" aria-modal="true" className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl"><div className="grid size-11 place-items-center rounded-2xl bg-red-50 text-red-600"><Trash2 className="size-5" /></div><h2 className="mt-5 text-xl font-black">{deleteDialog.mode === "all" ? "전체 응답 삭제" : `${selectedSessions.size}개 세션 삭제`}</h2><p className="mt-3 text-sm font-medium leading-6 text-slate-600">응답, 답안 변경 이벤트, 별점과 재생 기록이 함께 삭제되며 복구할 수 없습니다. 이메일 수신 동의는 유지됩니다.</p>{deleteDialog.mode === "all" && <label className="mt-5 block text-sm font-bold text-red-700">확인을 위해 “전체 응답 삭제”를 입력하세요.<input autoFocus value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} className="mt-2 w-full rounded-xl border border-red-200 px-4 py-3 text-slate-900" /></label>}<div className="mt-6 flex justify-end gap-2"><button onClick={() => { setDeleteDialog(null); setDeleteConfirmation(""); }} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold">취소</button><button disabled={Boolean(busy) || (deleteDialog.mode === "all" && deleteConfirmation !== "전체 응답 삭제")} onClick={() => void confirmDeletion()} className="rounded-xl bg-red-600 px-4 py-3 text-sm font-black text-white disabled:opacity-40">삭제</button></div></div></div>}
    </div>
  );
}
