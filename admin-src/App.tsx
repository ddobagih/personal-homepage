import { FormEvent, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { WorkspaceProvider, useAuth } from "./platform/workspace";
import { ThemeProvider } from "./upstream/components/providers/theme-provider";
import { ToasterProvider } from "./upstream/components/providers/toaster-provider";
import { ModalProvider } from "./upstream/components/providers/modal-provider";
import MainLayout from "./upstream/app/(main)/layout";
import DocumentsPage from "./upstream/app/(main)/(routes)/documents/page";
import DocumentPage from "./upstream/app/(main)/(routes)/documents/[documentId]/page";
import PreviewPage from "./upstream/app/(public)/(routes)/preview/[documentId]/page";
import { Button } from "./upstream/components/ui/button";
import { Input } from "./upstream/components/ui/input";
import { Spinner } from "./upstream/components/spinner";
import type { Id } from "@/convex/_generated/dataModel";

function Login() {
  const auth = useAuth();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const request = async () => {
    setBusy(true); setMessage("");
    try {
      const response = await auth.requestCode(); setSent(true);
      setMessage(response?.deliveryMode === "console" ? "개발 환경에서는 인증 코드가 서버 터미널에 표시됩니다. 해당 코드를 입력해 주세요." : "등록된 관리자 이메일로 인증 코드를 보냈습니다.");
    }
    catch (error) { setMessage(error instanceof Error ? error.message : "인증 코드를 보내지 못했습니다."); }
    finally { setBusy(false); }
  };
  const verify = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage("");
    try { await auth.verifyCode(code.trim()); }
    catch (error) { setMessage(error instanceof Error ? error.message : "인증에 실패했습니다. 코드를 확인해 주세요."); }
    finally { setBusy(false); }
  };
  return <main className="flex min-h-screen items-center justify-center p-5">
    <section className="w-full max-w-sm space-y-5 rounded-xl border p-6">
      <div><h1 className="text-2xl font-semibold">페이지 관리</h1><p className="mt-2 text-sm text-muted-foreground">이메일 인증 후 페이지를 편집할 수 있습니다.</p></div>
      <Button className="w-full" disabled={busy} onClick={request}>{sent ? "인증 코드 다시 받기" : "이메일 인증 코드 받기"}</Button>
      <form onSubmit={verify} className="space-y-3">
        <label className="block text-sm" htmlFor="admin-otp">인증 코드</label>
        <Input id="admin-otp" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="6자리 인증 코드" required disabled={busy} />
        <Button type="submit" className="w-full" disabled={busy || !/^\d{6}$/.test(code)}>로그인</Button>
      </form>
      <p role="status" className="text-sm text-muted-foreground">{message}</p>
      <a href="/" className="block text-sm underline">공개 사이트로 돌아가기</a>
    </section>
  </main>;
}

type SiteFields = { title: string; lead: string; footer: string; email: string; github: string; copy: string };
const emptySiteFields: SiteFields = { title: "", lead: "", footer: "", email: "", github: "", copy: "" };

function useSiteSettingsDraft(auth: ReturnType<typeof useAuth>, enabled: boolean) {
  const [loaded, setLoaded] = useState<{ content: Record<string, any>; revision: string; csrfToken: string } | null>(null);
  const [fields, setFields] = useState<SiteFields>(emptySiteFields);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const baseline = loaded ? { title: loaded.content.site?.title || "", lead: loaded.content.site?.lead || "", footer: loaded.content.footer || "", email: loaded.content.contact?.email || "", github: loaded.content.contact?.github || "", copy: loaded.content.contact?.copy || "" } : emptySiteFields;
  const dirty = loaded !== null && JSON.stringify(fields) !== JSON.stringify(baseline);
  useEffect(() => {
    if (!dirty) return;
    const preventLoss = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", preventLoss);
    return () => window.removeEventListener("beforeunload", preventLoss);
  }, [dirty]);
  useEffect(() => {
    if (!enabled || !auth.authenticated || loaded) return;
    let cancelled = false;
    fetch("/api/admin/content", { credentials: "same-origin", cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("사이트 설정을 불러오지 못했습니다.");
      const payload = await response.json();
      if (cancelled) return;
      setLoaded(payload);
      setFields({ title: payload.content.site?.title || "", lead: payload.content.site?.lead || "", footer: payload.content.footer || "", email: payload.content.contact?.email || "", github: payload.content.contact?.github || "", copy: payload.content.contact?.copy || "" });
    }).catch((error) => { if (!cancelled) setMessage(error.message); });
    return () => { cancelled = true; };
  }, [enabled, auth.authenticated, loaded]);
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!loaded) return;
    setBusy(true); setMessage("설정 저장 중…");
    const content = { ...loaded.content, site: { ...loaded.content.site, title: fields.title, lead: fields.lead }, footer: fields.footer, contact: { ...loaded.content.contact, email: fields.email, github: fields.github, copy: fields.copy } };
    try {
      const response = await fetch("/api/admin/content", { method: "PUT", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-CSRF-Token": auth.csrfToken }, body: JSON.stringify({ content, expectedRevision: loaded.revision }) });
      if (!response.ok) throw new Error(response.status === 409 ? "다른 곳에서 사이트 설정이 변경되었습니다. 현재 입력은 유지했습니다. 다른 변경을 확인한 뒤 다시 열어 주세요." : "설정을 저장하지 못했습니다. 현재 입력은 유지했습니다.");
      const payload = await response.json(); setLoaded({ ...loaded, ...payload }); setMessage("사이트 설정과 연락처를 저장했습니다.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "저장에 실패했습니다."); }
    finally { setBusy(false); }
  };
  return { loaded, fields, setFields, busy, message, setMessage, save };
}

function SiteSettings({ visible, draft }: { visible: boolean; draft: ReturnType<typeof useSiteSettingsDraft> }) {
  const { loaded, fields, setFields, busy, message, setMessage, save } = draft;
  const router = useRouter();
  const field = (key: keyof SiteFields, label: string, multiline = false) => <label className="block space-y-2" key={key}><span className="text-sm">{label}</span>{multiline ? <textarea className="w-full min-h-24 rounded-md border bg-transparent p-3 text-sm" value={fields[key]} onChange={(event) => setFields((previous) => ({ ...previous, [key]: event.target.value }))} /> : <Input value={fields[key]} onChange={(event) => setFields((previous) => ({ ...previous, [key]: event.target.value }))} />}</label>;
  return <section hidden={!visible} className="mx-auto max-w-2xl p-6 md:p-10">
    <Button variant="ghost" onClick={() => router.push("/documents")}>← 페이지 목록</Button>
    <h1 className="my-5 text-2xl font-semibold">사이트 설정·연락처</h1>
    <form onSubmit={save} className="space-y-5">
      <fieldset disabled={busy || !loaded} className="space-y-5">
        {field("title", "홈 제목")}{field("lead", "홈 소개", true)}{field("footer", "하단 문구")}{field("email", "연락 이메일")}{field("github", "GitHub 주소")}{field("copy", "연락처 소개", true)}
        <Button type="submit">설정 저장</Button>
        <Button type="button" variant="outline" onClick={async () => {
          try { await navigator.clipboard.writeText(JSON.stringify(fields, null, 2)); setMessage("현재 입력 내용을 복사했습니다."); }
          catch { setMessage("복사하지 못했습니다. 입력 내용을 직접 선택해 복사해 주세요."); }
        }}>입력 내용 복사</Button>
      </fieldset>
      <p role="status" className="text-sm text-muted-foreground">{message}</p>
    </form>
  </section>;
}

function decodeDocumentId(value: string): Id<"documents"> {
  try { return decodeURIComponent(value); } catch { return value; }
}

function WorkspaceRoutes() {
  const auth = useAuth();
  const pathname = usePathname();
  const path = window.location.pathname.startsWith("/preview/") ? window.location.pathname : pathname;
  const preview = path.match(/^\/preview\/([^/?#]+)/);
  const siteSettingsDraft = useSiteSettingsDraft(auth, !preview);
  if (preview) return <PreviewPage key={preview[1]} params={{ documentId: decodeDocumentId(preview[1]) }} />;
  if (auth.loading) return <div className="flex h-screen items-center justify-center"><Spinner size="md" /></div>;
  if (!auth.authenticated) return <Login />;
  const document = path.match(/^\/documents\/([^/?#]+)/);
  const settings = path === "/settings";
  return <><ModalProvider /><MainLayout>
    <SiteSettings visible={settings} draft={siteSettingsDraft} />
    {!settings && (document ? <DocumentPage key={document[1]} params={{ documentId: decodeDocumentId(document[1]) }} /> : <DocumentsPage />)}
  </MainLayout></>;
}

export default function App() {
  return <ThemeProvider attribute="class" defaultTheme="system" enableSystem><WorkspaceProvider><WorkspaceRoutes /><ToasterProvider /></WorkspaceProvider></ThemeProvider>;
}
