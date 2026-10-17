import { useCallback, useEffect, useRef, useState } from "react";
import { useAgent } from "agents/react";
import { InstallApp } from "./install-app";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Brain,
  Check,
  ChevronDown,
  Compass,
  Download,
  ExternalLink,
  Globe2,
  History,
  LoaderCircle,
  Menu,
  MessageSquare,
  PanelLeftClose,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Square,
  Telescope,
  X,
} from "lucide-react";
import { Button, Markdown, Sheet, SheetContent, SheetTrigger, cn } from "@citadel/ui";
import { defaultSettings, models, type Effort, type ModelSettings } from "@citadel/ai/models";
import type {
  Conversation,
  LiveEvent,
  ResearchPlan,
  Run,
  Snapshot,
  Source,
} from "../../server/contracts";

interface Initial {
  conversations: Conversation[];
  initialSnapshot: Snapshot | null;
  email: string;
  demo: boolean;
  configured: boolean;
}
const suggestions = [
  {
    icon: Telescope,
    category: "Explore a topic",
    title: "Go beyond the headlines",
    prompt:
      "Research the most significant recent developments in renewable energy storage. Compare primary sources, practical implications, and remaining uncertainties.",
  },
  {
    icon: Compass,
    category: "Compare possibilities",
    title: "Find the right direction",
    prompt:
      "Compare Cloudflare Workers and a traditional VPS for hosting personal internal tools. Evaluate costs, maintenance, reliability, and limitations using current primary sources.",
  },
  {
    icon: BookOpen,
    category: "Understand deeply",
    title: "Make the complex clear",
    prompt:
      "Research how retrieval-augmented generation works, where it helps, and its failure modes. Use primary technical sources and explain the tradeoffs clearly.",
  },
  {
    icon: Globe2,
    category: "Connect the dots",
    title: "See the bigger picture",
    prompt:
      "Research how AI infrastructure demand is affecting energy systems. Compare credible primary sources and distinguish established facts from projections.",
  },
];
const busy = (run: Run) => ["queued", "running", "uncertain"].includes(run.status);

async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(
    path,
    body === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({
      error: "Your session may have expired. Reload the page to reconnect.",
    }))) as { error?: string };
    throw new Error(payload.error || "The request could not be completed.");
  }
  return response.json() as Promise<T>;
}

function LyraMark({ className }: { className?: string }) {
  return (
    <img
      src="/logo.png"
      width={32}
      height={32}
      alt=""
      aria-hidden="true"
      className={cn("size-8 object-contain", className)}
    />
  );
}

function ConversationStream({
  id,
  onRefresh,
  onDelta,
}: {
  id: string;
  onRefresh: () => void;
  onDelta: (runId: string, text: string) => void;
}) {
  useAgent({
    agent: "conversation-agent",
    name: id,
    onOpen: onRefresh,
    onMessage: (message) => {
      try {
        const event = JSON.parse(String(message.data)) as LiveEvent;
        if (event.type === "refresh") onRefresh();
        if (event.type === "delta" && typeof event.text === "string")
          onDelta(event.runId, event.text);
      } catch {
        /* Ignore SDK protocol messages. */
      }
    },
  });
  return null;
}

export function ChatApp({ initial }: { initial: Initial }) {
  const [conversations, setConversations] = useState(initial.conversations);
  const [current, setCurrent] = useState(initial.initialSnapshot);
  const [selected, setSelected] = useState<string | null>(
    initial.initialSnapshot?.conversation.id || null,
  );
  const [settings, setSettings] = useState<ModelSettings>(
    initial.initialSnapshot?.conversation.settings || defaultSettings,
  );
  const [mode, setMode] = useState<"chat" | "research">("research");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [live, setLive] = useState<{ runId: string; text: string } | null>(null);
  const selectedRef = useRef(selected);
  const settingsDirty = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pendingSubmission = useRef<{
    id: string;
    content: string;
    mode: string;
    settings: ModelSettings;
    conversationId: string;
  } | null>(null);
  const pendingApproval = useRef(new Map<string, string>());
  selectedRef.current = selected;

  const refresh = useCallback(async () => {
    const id = selectedRef.current;
    if (!id) return;
    try {
      const data = await request<Snapshot>(`/api/conversations/${id}`);
      if (selectedRef.current === id) {
        setCurrent(data);
        setConversations((items) =>
          [data.conversation, ...items.filter((item) => item.id !== id)].sort(
            (a, b) => b.updatedAt - a.updatedAt,
          ),
        );
      }
    } catch (failure) {
      if (selectedRef.current === id)
        setError(failure instanceof Error ? failure.message : "Unable to reconnect.");
    }
  }, []);

  useEffect(() => {
    if (!selected) return;
    void refresh();
    // Saved D1 snapshots recover missed websocket notifications and session reconnects.
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 5_000);
    const resume = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", resume);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [selected, refresh]);

  useEffect(() => {
    const pop = () => {
      const id = new URL(location.href).searchParams.get("c");
      selectedRef.current = id;
      settingsDirty.current = false;
      setSelected(id);
      setCurrent(null);
      setLive(null);
    };
    addEventListener("popstate", pop);
    return () => removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    if (current && !settingsDirty.current) setSettings(current.conversation.settings);
  }, [current]);
  useEffect(() => {
    if (atBottom && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [current, live, atBottom]);
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 180)}px`;
    }
  }, [draft]);

  function selectConversation(id: string | null) {
    setSelected(id);
    selectedRef.current = id;
    setCurrent(null);
    setLive(null);
    setError(null);
    setMobileNav(false);
    setAtBottom(true);
    settingsDirty.current = false;
    setSettings(conversations.find((item) => item.id === id)?.settings || defaultSettings);
    history.pushState(null, "", id ? `/?c=${id}` : "/");
  }
  const active = current?.runs.findLast(busy);
  const currentPlan = current?.plans.findLast((plan) => plan.status === "pending");
  const allSources = current?.messages.flatMap((message) => message.sources) || [];
  const sources = [...new Map(allSources.map((source) => [source.url, source])).values()];
  const latestResearch = current?.runs.findLast(
    (run) => run.mode === "research" && run.reportReady,
  );

  async function send() {
    if (!draft.trim() || sending || active) return;
    setSending(true);
    setError(null);
    try {
      let id = selectedRef.current;
      if (!id) {
        const created = await request<{ id: string }>("/api/conversations", {});
        id = created.id;
        selectedRef.current = id;
        setSelected(id);
        history.replaceState(null, "", `/?c=${id}`);
      }
      const content = draft.trim();
      const pending = pendingSubmission.current;
      if (
        !pending ||
        pending.content !== content ||
        pending.mode !== mode ||
        JSON.stringify(pending.settings) !== JSON.stringify(settings) ||
        pending.conversationId !== id
      ) {
        pendingSubmission.current = {
          id: crypto.randomUUID(),
          content,
          mode,
          settings: { ...settings },
          conversationId: id,
        };
      }
      await request<Run>(`/api/conversations/${id}/messages`, pendingSubmission.current);
      pendingSubmission.current = null;
      settingsDirty.current = false;
      setDraft("");
      setLive(null);
      setAtBottom(true);
      await refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to send your message.");
    } finally {
      setSending(false);
    }
  }
  async function approve(plan: ResearchPlan) {
    if (sending || active) return;
    setSending(true);
    setError(null);
    try {
      const id = pendingApproval.current.get(plan.id) || crypto.randomUUID();
      pendingApproval.current.set(plan.id, id);
      await request(`/api/conversations/${plan.conversationId}/plans/${plan.id}/approve`, { id });
      await refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to approve the plan.");
    } finally {
      setSending(false);
    }
  }
  async function stop() {
    if (!active || !selected) return;
    try {
      await request(`/api/conversations/${selected}/runs/${active.id}/cancel`, {});
      setLive(null);
      await refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to stop the run.");
    }
  }
  const nav = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-20 items-center justify-between px-5">
        <a
          href="/"
          onClick={(event) => {
            event.preventDefault();
            selectConversation(null);
          }}
          className="flex items-center gap-2.5"
        >
          <LyraMark />
          <span className="text-xl font-semibold tracking-[-0.06em]">
            lyra<span className="text-primary">.</span>
          </span>
        </a>
        <span className="rounded border border-border px-1.5 py-0.5 text-[9px] tracking-widest text-muted-foreground">
          CITADEL
        </span>
      </div>
      <div className="px-4">
        <Button
          className="w-full justify-start gap-3"
          variant="secondary"
          onClick={() => selectConversation(null)}
        >
          <Plus className="text-primary" />
          New conversation
        </Button>
      </div>
      <div className="mt-7 flex items-center justify-between px-6">
        <span className="text-[10px] font-medium tracking-[0.16em] text-muted-foreground">
          YOUR CONVERSATIONS
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="size-10 sm:size-7"
          aria-label="Search conversations"
          onClick={() => setSearch(search === "\u0000" ? "" : "\u0000")}
        >
          <Search className="size-3.5" />
        </Button>
      </div>
      {search !== "" && (
        <div className="mx-4 mt-2">
          <input
            autoFocus
            aria-label="Filter conversations"
            placeholder="Search conversations…"
            value={search === "\u0000" ? "" : search}
            onChange={(event) => setSearch(event.target.value || "\u0000")}
            className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs outline-none focus:border-primary"
          />
        </div>
      )}
      <nav aria-label="Conversations" className="mt-3 flex-1 overflow-y-auto px-3">
        {conversations
          .filter((conversation) =>
            conversation.title
              .toLowerCase()
              .includes(search === "\u0000" ? "" : search.toLowerCase()),
          )
          .map((conversation) => (
            <button
              key={conversation.id}
              onClick={() => selectConversation(conversation.id)}
              aria-current={selected === conversation.id ? "page" : undefined}
              className={cn(
                "mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-xs transition-colors",
                selected === conversation.id
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              <MessageSquare className="size-3.5 shrink-0" />
              <span className="truncate">{conversation.title}</span>
            </button>
          ))}
        {!conversations.length && (
          <p className="px-3 py-5 text-xs leading-relaxed text-muted-foreground/70">
            A space for your next question.
            <br />
            Your conversations will live here.
          </p>
        )}
      </nav>
      <div className="px-4">
        <InstallApp />
      </div>
      <div className="m-4 rounded-xl border border-border/70 bg-background/50 p-3.5">
        <div className="flex items-center gap-2 text-xs font-medium">
          <ShieldCheck className="size-3.5 text-primary" />
          Your private corner
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          A personal workspace for ideas worth exploring.
        </p>
      </div>
      <div className="flex items-center gap-3 border-t border-border/70 px-5 py-4">
        <span className="grid size-8 place-items-center rounded-full border border-border bg-accent text-xs text-primary">
          {initial.email[0]?.toUpperCase() || "Y"}
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium">Personal workspace</p>
          <p className="mt-1 truncate text-[10px] text-muted-foreground">{initial.email}</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-background pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
      {selected && (
        <ConversationStream
          key={selected}
          id={selected}
          onRefresh={() => {
            void refresh();
          }}
          onDelta={(runId, text) => setLive({ runId, text })}
        />
      )}
      <aside
        className={cn(
          "hidden shrink-0 border-r border-border/70 bg-card/55 md:block",
          sidebarOpen ? "w-0 overflow-hidden border-0" : "w-[258px]",
        )}
      >
        {nav}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-border/50 px-4 sm:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <Sheet open={mobileNav} onOpenChange={setMobileNav}>
              <SheetTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="md:hidden"
                  aria-label="Open navigation"
                >
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent title="Your workspace" className="[&>div:first-child]:sr-only">
                {nav}
              </SheetContent>
            </Sheet>
            <Button
              size="icon"
              variant="ghost"
              className="hidden md:inline-flex"
              aria-label={sidebarOpen ? "Show sidebar" : "Hide sidebar"}
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              <PanelLeftClose />
            </Button>
            <span className="hidden text-xs text-muted-foreground sm:inline">Workspace</span>
            <span className="hidden text-muted-foreground/40 sm:inline">/</span>
            <span className="truncate text-xs font-medium">
              {current?.conversation.title || "New conversation"}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-4">
            {initial.demo && (
              <span className="rounded-full border border-border px-2 py-1 text-[10px] text-muted-foreground">
                Local demo
              </span>
            )}
            <span className="hidden items-center gap-1.5 text-[10px] text-muted-foreground sm:flex">
              <span className="size-1.5 rounded-full bg-primary/80" />
              Private workspace
            </span>
            <Button
              size="icon"
              variant="ghost"
              aria-label="View sources"
              onClick={() => setSourcesOpen(true)}
            >
              <BookOpen />
            </Button>
          </div>
        </header>
        <main className="relative flex min-h-0 flex-1 flex-col">
          <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
            {active
              ? active.mode === "research"
                ? "Lyra is researching. Progress will be saved."
                : "Lyra is preparing a response."
              : current?.runs.at(-1)?.status === "completed"
                ? "Lyra’s response is ready."
                : ""}
          </p>
          <div
            ref={scrollRef}
            onScroll={() => {
              const node = scrollRef.current;
              if (node) setAtBottom(node.scrollHeight - node.scrollTop - node.clientHeight < 120);
            }}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          >
            {!current?.messages.length ? (
              <div className="mx-auto flex min-h-full max-w-[850px] flex-col justify-center px-6 pb-8 pt-10 sm:px-10">
                <div className="mb-6 flex items-center gap-2 text-[10px] font-medium tracking-[0.18em] text-primary/80">
                  <span className="h-px w-7 bg-primary/60" />A SPACE FOR CURIOSITY
                </div>
                <h1 className="text-[clamp(2.1rem,4.2vw,3.35rem)] font-medium leading-[1.2] tracking-[-0.055em]">
                  A little curiosity.
                  <br />
                  <span className="text-primary">A clearer picture.</span>
                </h1>
                <p className="mt-5 max-w-[480px] text-sm leading-7 text-muted-foreground">
                  Follow a question. Explore the evidence. Connect the dots.
                  <br className="hidden sm:block" /> I’m Lyra, your companion for thinking things
                  through.
                </p>
                <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion.category}
                      onClick={() => {
                        setDraft(suggestion.prompt);
                        setMode("research");
                        inputRef.current?.focus();
                      }}
                      className="group rounded-xl border border-border/80 bg-card/35 p-4 text-left transition-colors hover:border-primary/35 hover:bg-card sm:p-5"
                    >
                      <div className="mb-4 flex items-center justify-between">
                        <suggestion.icon
                          className="size-[18px] text-primary/75"
                          strokeWidth={1.5}
                        />
                        <ArrowRight className="size-3.5 text-muted-foreground/30 transition-colors group-hover:text-primary" />
                      </div>
                      <p className="text-xs font-medium">{suggestion.category}</p>
                      <p className="mt-1.5 text-xs text-muted-foreground">{suggestion.title}</p>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mx-auto max-w-[820px] space-y-8 px-5 py-8 sm:px-10">
                {current.messages.map((message) => {
                  const run = current.runs.find((item) => item.id === message.runId);
                  const text =
                    live?.runId === message.runId && run && busy(run) ? live.text : message.content;
                  return (
                    <article
                      key={message.id}
                      className={cn(
                        message.role === "user"
                          ? "ml-auto max-w-[90%] rounded-2xl rounded-br-md border border-border bg-secondary px-5 py-3"
                          : "",
                      )}
                    >
                      {message.role === "assistant" && (
                        <div className="mb-3 flex items-center gap-2">
                          <LyraMark className="size-5" />
                          <span className="text-xs font-semibold">Lyra</span>
                          {run && (
                            <span className="ml-1 text-[10px] text-muted-foreground">
                              {models.find((item) => item.id === run.settings.model)?.name} ·{" "}
                              {run.settings.effort}
                            </span>
                          )}
                        </div>
                      )}
                      <Markdown>{text}</Markdown>
                      {!!message.sources.length && (
                        <button
                          onClick={() => setSourcesOpen(true)}
                          className="mt-4 flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-[11px] text-muted-foreground hover:text-primary"
                        >
                          <Globe2 className="size-3" />
                          {message.sources.length} sources
                          <ChevronDown className="size-3" />
                        </button>
                      )}
                      {run &&
                        message.role === "assistant" &&
                        !busy(run) &&
                        run.usage.outputTokens > 0 && (
                          <p className="mt-3 text-[10px] text-muted-foreground/70">
                            {(run.usage.inputTokens + run.usage.outputTokens).toLocaleString()}{" "}
                            tokens
                            {run.estimatedCost !== null
                              ? ` · ~$${run.estimatedCost.toFixed(4)} estimated`
                              : " · Cost estimate unavailable"}
                          </p>
                        )}
                    </article>
                  );
                })}
                {currentPlan && (
                  <PlanCard
                    plan={currentPlan}
                    settings={
                      current.runs.find((run) => run.id === currentPlan.id)?.settings || settings
                    }
                    disabled={sending || !!active}
                    onApprove={() => {
                      void approve(currentPlan);
                    }}
                    onRevise={() => {
                      setMode("research");
                      setDraft("Please revise the research plan: ");
                      inputRef.current?.focus();
                    }}
                  />
                )}
                {active && (
                  <div
                    className="rounded-xl border border-border bg-card/60 p-4"
                    role="status"
                    aria-live="polite"
                  >
                    <div className="flex items-center gap-2 text-xs font-medium">
                      {active.status === "uncertain" ? (
                        <History className="size-4 text-primary" />
                      ) : (
                        <LoaderCircle className="size-4 animate-spin text-primary" />
                      )}
                      {active.status === "uncertain"
                        ? "Submission needs attention"
                        : active.mode === "research"
                          ? "Following the evidence"
                          : active.mode === "plan"
                            ? "Shaping your research plan"
                            : "Thinking it through"}
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      {active.error ||
                        current.events.filter((event) => event.runId === active.id).at(-1)
                          ?.message ||
                        "Your request is queued."}
                    </p>
                    {active.mode === "research" && (
                      <p className="mt-3 text-[10px] text-muted-foreground/70">
                        Research continues when you leave this page.
                      </p>
                    )}
                  </div>
                )}
                {!active && current.runs.at(-1)?.error && (
                  <div
                    role="status"
                    className="rounded-xl border border-border bg-card p-4 text-xs leading-relaxed text-muted-foreground"
                  >
                    {current.runs.at(-1)?.error}
                  </div>
                )}
                {latestResearch && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={`/api/conversations/${selected}/runs/${latestResearch.id}/report`}>
                      <Download />
                      Download report
                    </a>
                  </Button>
                )}
              </div>
            )}
          </div>
          {!atBottom && (
            <Button
              variant="secondary"
              size="icon"
              className="absolute bottom-[220px] left-1/2 z-10 rounded-full shadow-lg"
              aria-label="Scroll to latest message"
              onClick={() => {
                setAtBottom(true);
              }}
            >
              <ArrowDown />
            </Button>
          )}
          <div className="shrink-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-8 sm:pb-5">
            <div className="mx-auto max-w-[740px]">
              {error && (
                <div
                  role="alert"
                  className="mb-3 flex items-start justify-between gap-3 rounded-lg border border-primary/30 bg-accent px-4 py-3 text-xs leading-relaxed"
                >
                  <p>{error}</p>
                  <button aria-label="Dismiss error" onClick={() => setError(null)}>
                    <X className="size-4" />
                  </button>
                </div>
              )}
              {!initial.configured && (
                <p className="mb-3 text-xs text-muted-foreground">
                  Add an OpenAI API key to start chatting, or enable local demo mode. See the setup
                  guide.
                </p>
              )}
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void send();
                }}
                className="rounded-2xl border border-input bg-card p-3 shadow-[0_0_50px_-20px_#16434d] transition-colors focus-within:border-primary/45 sm:p-4"
              >
                <label className="sr-only" htmlFor="message">
                  Message Lyra
                </label>
                <textarea
                  id="message"
                  ref={inputRef}
                  rows={2}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  maxLength={24_000}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      !event.shiftKey &&
                      !event.nativeEvent.isComposing &&
                      window.matchMedia("(min-width: 768px)").matches
                    ) {
                      event.preventDefault();
                      void send();
                    }
                  }}
                  placeholder={
                    currentPlan
                      ? "Refine the plan, or approve it above…"
                      : mode === "research"
                        ? "What would you like to explore?"
                        : "Ask a question, follow a thought…"
                  }
                  className="block max-h-[180px] min-h-[60px] w-full resize-none bg-transparent px-1 py-1 text-[16px] leading-6 text-foreground outline-none placeholder:text-muted-foreground/65 focus-visible:outline-none sm:text-sm"
                />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2">
                    <div className="relative">
                      <Sparkles className="pointer-events-none absolute left-2.5 top-1/2 size-3 -translate-y-1/2 text-primary" />
                      <select
                        aria-label="Conversation mode"
                        value={mode}
                        onChange={(event) => setMode(event.target.value as "chat" | "research")}
                        className="h-11 appearance-none rounded-lg border border-border bg-secondary pl-7 pr-6 text-[10px] font-medium text-primary sm:h-8 sm:text-xs"
                      >
                        <option value="research">Deep research</option>
                        <option value="chat">Chat</option>
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-2.5 -translate-y-1/2 text-muted-foreground" />
                    </div>
                    <div className="relative">
                      <select
                        aria-label="Model"
                        value={settings.model}
                        onChange={(event) => {
                          const model = models.find((item) => item.id === event.target.value)!;
                          settingsDirty.current = true;
                          setSettings({
                            model: model.id,
                            effort: model.efforts.includes(settings.effort)
                              ? settings.effort
                              : "medium",
                          });
                        }}
                        className="h-11 max-w-[130px] appearance-none rounded-lg border border-transparent bg-transparent pl-2 pr-5 text-[10px] text-muted-foreground hover:bg-secondary sm:h-8 sm:text-xs"
                      >
                        {models.map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.name}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 size-2.5 -translate-y-1/2 text-muted-foreground" />
                    </div>
                    <div className="relative">
                      <Brain className="pointer-events-none absolute left-1.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
                      <select
                        aria-label="Thinking effort"
                        value={settings.effort}
                        onChange={(event) => {
                          settingsDirty.current = true;
                          setSettings({ ...settings, effort: event.target.value as Effort });
                        }}
                        className="h-11 appearance-none rounded-lg border border-transparent bg-transparent pl-6 pr-5 text-[10px] capitalize text-muted-foreground hover:bg-secondary sm:h-8 sm:text-xs"
                      >
                        {models
                          .find((model) => model.id === settings.model)
                          ?.efforts.map((effort) => (
                            <option key={effort} value={effort}>
                              {effort}
                            </option>
                          ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 size-2.5 -translate-y-1/2 text-muted-foreground" />
                    </div>
                  </div>
                  {active ? (
                    <Button
                      type="button"
                      size="icon"
                      className="size-11 rounded-xl sm:size-9"
                      aria-label="Stop generation"
                      onClick={() => {
                        void stop();
                      }}
                    >
                      <Square className="size-3.5 fill-current" />
                    </Button>
                  ) : (
                    <Button
                      type="submit"
                      size="icon"
                      className="size-11 rounded-xl sm:size-9"
                      disabled={!draft.trim() || sending || !initial.configured}
                      aria-label="Send message"
                    >
                      {sending ? <LoaderCircle className="animate-spin" /> : <ArrowUp />}
                    </Button>
                  )}
                </div>
              </form>
              <div className="mt-3 flex items-center justify-center gap-1.5 text-center text-[10px] leading-relaxed text-muted-foreground/65">
                <ShieldCheck className="size-3 shrink-0" />
                <span>Stay curious. Check the sources. Make up your own mind.</span>
              </div>
            </div>
          </div>
        </main>
      </div>
      <Sheet open={sourcesOpen} onOpenChange={setSourcesOpen}>
        <SheetContent
          side="right"
          title="Research sources"
          description="Evidence gathered during this conversation."
        >
          <Sources sources={sources} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function PlanCard({
  plan,
  settings,
  disabled,
  onApprove,
  onRevise,
}: {
  plan: ResearchPlan;
  settings: ModelSettings;
  disabled: boolean;
  onApprove: () => void;
  onRevise: () => void;
}) {
  return (
    <section
      aria-label="Research plan"
      className="overflow-hidden rounded-xl border border-primary/25 bg-card"
    >
      <div className="border-b border-border px-5 py-4">
        <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-widest text-primary">
          <Compass className="size-3.5" />
          Your research plan
        </div>
        <h2 className="mt-3 text-base font-medium tracking-tight">{plan.title}</h2>
        <p className="mt-2 text-xs leading-6 text-muted-foreground">{plan.summary}</p>
      </div>
      <ol className="space-y-4 px-5 py-5">
        {plan.questions.map((question, index) => (
          <li key={question} className="flex gap-3 text-xs leading-6">
            <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-border text-[10px] text-primary">
              {index + 1}
            </span>
            {question}
          </li>
        ))}
      </ol>
      <div className="border-t border-border px-5 py-4">
        <p className="mb-3 text-[10px] text-muted-foreground">
          {models.find((model) => model.id === settings.model)?.name} · {settings.effort} thinking ·
          up to 24 searches · 30 minute limit
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={disabled} onClick={onApprove}>
            <Check />
            Approve & research
          </Button>
          <Button size="sm" variant="ghost" disabled={disabled} onClick={onRevise}>
            Revise plan
          </Button>
        </div>
      </div>
    </section>
  );
}
function Sources({ sources }: { sources: Source[] }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-5">
      {sources.length ? (
        <ol className="space-y-3">
          {sources.map((source, index) => (
            <li key={source.url}>
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex gap-3 rounded-xl border border-border p-4 transition-colors hover:bg-accent"
              >
                <span className="mt-0.5 text-[10px] text-primary">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium leading-5">{source.title}</p>
                  <p className="mt-2 truncate text-[10px] text-muted-foreground">
                    {new URL(source.url).hostname}
                  </p>
                </div>
                <ExternalLink className="mt-1 size-3 shrink-0 text-muted-foreground group-hover:text-primary" />
              </a>
            </li>
          ))}
        </ol>
      ) : (
        <div className="py-12 text-center">
          <BookOpen className="mx-auto size-7 text-muted-foreground/60" />
          <p className="mt-4 text-sm">A clearer picture starts with evidence.</p>
          <p className="mt-2 text-xs leading-6 text-muted-foreground">
            Sources will appear here when your research is ready.
          </p>
        </div>
      )}
    </div>
  );
}
