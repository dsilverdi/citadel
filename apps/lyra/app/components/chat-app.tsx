import { useCallback, useEffect, useRef, useState } from "react";
import { useAgent } from "agents/react";
import { InstallApp } from "./install-app";
import {
  ArrowDown,
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
  Square,
  SquarePen,
  SlidersHorizontal,
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
      src="/logo.png?v=3"
      width={32}
      height={32}
      alt=""
      aria-hidden="true"
      className={cn("size-8 rounded-full object-cover", className)}
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
  const [optionsOpen, setOptionsOpen] = useState(false);
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
      <div className="hidden h-20 items-center px-6 md:flex">
        <a
          href="/"
          onClick={(event) => {
            event.preventDefault();
            selectConversation(null);
          }}
          className="flex items-center gap-2.5"
        >
          <LyraMark />
          <span className="text-xl font-medium tracking-tight">Lyra</span>
        </a>
      </div>
      <div className="px-4">
        <Button
          className="h-12 w-full justify-start gap-3 rounded-full px-4"
          variant="secondary"
          onClick={() => selectConversation(null)}
        >
          <SquarePen />
          New chat
        </Button>
      </div>
      <div className="mt-7 flex items-center justify-between px-6">
        <span className="text-xs font-medium text-muted-foreground">Chats</span>
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
                "mb-1 flex w-full items-center gap-3 rounded-full px-4 py-3 text-left text-sm transition-colors",
                selected === conversation.id
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              <span className="truncate">{conversation.title}</span>
            </button>
          ))}
        {!conversations.length && (
          <p className="px-3 py-5 text-xs leading-relaxed text-muted-foreground/70">
            Your chats will appear here.
          </p>
        )}
      </nav>
      <div className="px-4">
        <InstallApp />
      </div>
      <div className="flex items-center gap-3 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5">
        <span className="grid size-9 place-items-center rounded-full bg-accent text-sm text-foreground">
          {initial.email[0]?.toUpperCase() || "Y"}
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium">Citadel</p>
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
          "hidden shrink-0 bg-muted/60 md:block",
          sidebarOpen ? "w-0 overflow-hidden border-0" : "w-[272px]",
        )}
      >
        {nav}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[76px] shrink-0 items-center justify-between px-3 sm:px-6">
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
              <SheetContent title="Lyra" className="w-full border-0 sm:w-[320px]">
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
            <div className="min-w-0">
              <button
                type="button"
                aria-label="Model settings"
                onClick={() => setOptionsOpen(true)}
                className="flex items-center gap-2 rounded-xl px-2 py-1 text-xl font-medium tracking-tight hover:bg-muted"
              >
                Lyra <ChevronDown className="size-4 text-muted-foreground" />
              </button>
              <p className="max-w-[45vw] truncate px-2 text-[11px] text-muted-foreground sm:max-w-xs">
                {models.find((model) => model.id === settings.model)?.name}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            {initial.demo && (
              <span className="rounded-full border border-border px-2 py-1 text-[10px] text-muted-foreground">
                Local demo
              </span>
            )}
            <Button
              size="icon"
              variant="ghost"
              aria-label="New chat"
              onClick={() => selectConversation(null)}
            >
              <SquarePen />
            </Button>
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
              <div className="relative isolate flex min-h-full flex-col items-center justify-center overflow-hidden px-6 pb-16 text-center">
                <img
                  src="/welcome-artwork.webp"
                  alt=""
                  aria-hidden="true"
                  width={1024}
                  height={1536}
                  className="pointer-events-none absolute inset-0 -z-10 h-full w-full select-none object-cover object-[center_35%] opacity-[0.06]"
                />
                <h1 className="max-w-[760px] text-[clamp(1.9rem,4vw,2.75rem)] font-normal leading-tight tracking-[-0.045em]">
                  What would you like to know?
                </h1>
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
                          ? "ml-auto max-w-[90%] rounded-3xl bg-secondary px-5 py-3"
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
                  <div className="rounded-2xl bg-muted/60 p-4" role="status" aria-live="polite">
                    <div className="flex items-center gap-2 text-xs font-medium">
                      {active.status === "uncertain" ? (
                        <History className="size-4 text-primary" />
                      ) : (
                        <LoaderCircle className="size-4 animate-spin text-primary" />
                      )}
                      {active.status === "uncertain"
                        ? "Submission needs attention"
                        : active.mode === "research"
                          ? "Researching…"
                          : active.mode === "plan"
                            ? "Preparing your research plan…"
                            : "Thinking…"}
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
          <div className="shrink-0 px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-8 sm:pb-7">
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
                className="rounded-[28px] bg-secondary/70 p-3 transition-colors focus-within:bg-secondary sm:p-4"
              >
                <label className="sr-only" htmlFor="message">
                  Message Lyra
                </label>
                <textarea
                  id="message"
                  ref={inputRef}
                  rows={1}
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
                        ? "Research a topic"
                        : "Ask Lyra"
                  }
                  className="block max-h-[180px] min-h-10 w-full resize-none bg-transparent px-3 py-2 text-base leading-6 text-foreground outline-none placeholder:text-muted-foreground focus-visible:outline-none"
                />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Chat options"
                      onClick={() => setOptionsOpen(true)}
                    >
                      <Plus className="size-5" />
                    </Button>
                    <button
                      type="button"
                      onClick={() => setOptionsOpen(true)}
                      className="flex h-11 items-center gap-2 rounded-full px-3 text-xs text-muted-foreground hover:bg-background/70"
                    >
                      {mode === "research" ? (
                        <Globe2 className="size-4" />
                      ) : (
                        <MessageSquare className="size-4" />
                      )}
                      {mode === "research" ? "Deep research" : "Chat"}
                    </button>
                  </div>
                  {active ? (
                    <Button
                      type="button"
                      size="icon"
                      className="size-11 rounded-full"
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
                      className="size-11 rounded-full"
                      disabled={!draft.trim() || sending || !initial.configured}
                      aria-label="Send message"
                    >
                      {sending ? <LoaderCircle className="animate-spin" /> : <ArrowUp />}
                    </Button>
                  )}
                </div>
              </form>
            </div>
          </div>
        </main>
      </div>
      <Sheet open={optionsOpen} onOpenChange={setOptionsOpen}>
        <SheetContent side="bottom" title="Chat options" className="mx-auto max-w-2xl">
          <div className="space-y-6 overflow-y-auto p-6">
            <div role="group" aria-label="Conversation mode" className="space-y-1">
              {(
                [
                  {
                    value: "chat",
                    title: "Chat",
                    description: "Ask a question or talk something through",
                    icon: MessageSquare,
                  },
                  {
                    value: "research",
                    title: "Deep research",
                    description: "Review a plan and get a report with sources",
                    icon: Globe2,
                  },
                ] as const
              ).map((item) => (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={mode === item.value}
                  onClick={() => {
                    setMode(item.value);
                    setOptionsOpen(false);
                    inputRef.current?.focus();
                  }}
                  className={cn(
                    "flex w-full items-center gap-4 rounded-2xl p-4 text-left hover:bg-muted",
                    mode === item.value && "bg-muted",
                  )}
                >
                  <item.icon className="size-5 shrink-0" strokeWidth={1.5} />
                  <span className="flex-1">
                    <span className="block text-sm font-medium">{item.title}</span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                      {item.description}
                    </span>
                  </span>
                  {mode === item.value && <Check className="size-4" />}
                </button>
              ))}
            </div>
            <div className="grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
              <label className="space-y-2">
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <SlidersHorizontal className="size-3.5" />
                  Model
                </span>
                <select
                  aria-label="Model"
                  value={settings.model}
                  onChange={(event) => {
                    const model = models.find((item) => item.id === event.target.value)!;
                    settingsDirty.current = true;
                    setSettings({
                      model: model.id,
                      effort: model.efforts.includes(settings.effort) ? settings.effort : "medium",
                    });
                  }}
                  className="h-12 w-full rounded-xl border border-border bg-background px-3 text-sm"
                >
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2">
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Brain className="size-3.5" />
                  Thinking effort
                </span>
                <select
                  aria-label="Thinking effort"
                  value={settings.effort}
                  onChange={(event) => {
                    settingsDirty.current = true;
                    setSettings({ ...settings, effort: event.target.value as Effort });
                  }}
                  className="h-12 w-full rounded-xl border border-border bg-background px-3 text-sm capitalize"
                >
                  {models
                    .find((model) => model.id === settings.model)
                    ?.efforts.map((effort) => (
                      <option key={effort} value={effort}>
                        {effort}
                      </option>
                    ))}
                </select>
              </label>
            </div>
          </div>
        </SheetContent>
      </Sheet>
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
      className="overflow-hidden rounded-2xl border border-border bg-card"
    >
      <div className="border-b border-border px-5 py-4">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
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
          <p className="mt-4 text-sm">No sources yet.</p>
          <p className="mt-2 text-xs leading-6 text-muted-foreground">
            Sources from your research will appear here.
          </p>
        </div>
      )}
    </div>
  );
}
