import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  FormEvent,
  KeyboardEvent,
  MouseEvent,
} from "react";
import { useNavigate } from "react-router-dom";

const API_URL = String(
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8000",
).replace(/\/+$/, "");

const MAX_QUERY_LENGTH = 20_000;
const DEFAULT_TOP_K = 5;

type User = {
  _id?: string;
  email?: string;
  username?: string | null;
  is_active?: boolean;
};

type QueryResponse = {
  answer: string;
  sources?: string[];
  knowledge_count?: number;
  conversation_id: string;
};

type Conversation = {
  id: string;
  title: string;
  created_at?: string;
  updated_at?: string;
};

type StoredMessage = {
  role: "user" | "assistant";
  content: string;
  sources?: string[];
  knowledge_count?: number;
  created_at?: string;
};

type ConversationDetail = Conversation & {
  messages: StoredMessage[];
};

type KnowledgeFile = {
  id: string;
  filename: string;
  file_type: string;
  file_size: number;
  status: string;
  created_at?: string;
};

type PendingFileStatus =
  | "ready"
  | "uploading"
  | "success"
  | "error";

type PendingFile = {
  id: string;
  file: File;
  progress: number;
  status: PendingFileStatus;
  error?: string;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: string[];
  knowledgeCount?: number;
  timestamp: Date;
};

// ============================================================
// AUTHENTICATION
// ============================================================

function getStoredToken(): string | null {
  return (
    window.localStorage.getItem("access_token") ||
    window.sessionStorage.getItem("access_token")
  );
}

function getStoredUser(): User | null {
  const stored =
    window.localStorage.getItem("jarvis_user") ||
    window.sessionStorage.getItem("jarvis_user");

  if (!stored) {
    return null;
  }

  try {
    return JSON.parse(stored) as User;
  } catch {
    return null;
  }
}

function clearAuthentication(): void {
  window.localStorage.removeItem("access_token");
  window.localStorage.removeItem("jarvis_user");

  window.sessionStorage.removeItem("access_token");
  window.sessionStorage.removeItem("jarvis_user");
}

// ============================================================
// GENERAL HELPERS
// ============================================================

function createId(): string {
  if (
    typeof crypto !== "undefined" &&
    "randomUUID" in crypto
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random()}`;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderMarkdownContent(
  content: string,
): React.ReactNode {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let currentParagraph: string[] = [];
  let currentBullet: string[] = [];

  const renderWithBold = (text: string) => {
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    const boldRegex = /\*\*([^*]+)\*\*/g;
    let match;

    while ((match = boldRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(
          text.substring(lastIndex, match.index),
        );
      }
      parts.push(
        <strong key={`bold-${match.index}`}>
          {match[1]}
        </strong>,
      );
      lastIndex = boldRegex.lastIndex;
    }

    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return parts.length > 0 ? parts : text;
  };

  const pushParagraph = () => {
    if (currentParagraph.length === 0) return;
    const text = currentParagraph.join(" ");
    elements.push(
      <p key={`para-${elements.length}`}>
        {renderWithBold(text)}
      </p>,
    );
    currentParagraph = [];
  };

  const pushBullet = () => {
    if (currentBullet.length === 0) return;
    const text = currentBullet.join(" ");
    elements.push(
      <div
        key={`bullet-${elements.length}`}
        style={{ marginLeft: "20px", marginBottom: "8px" }}
      >
        • {renderWithBold(text)}
      </div>,
    );
    currentBullet = [];
  };

  const isBulletOrNumberedStart = (
    line: string,
  ): boolean => {
    const trimmed = line.trim();
    return (
      /^[-•*]\s/.test(trimmed) ||
      /^\d+[\s.]\s/.test(trimmed) ||
      /^[a-z][\s.]\s/.test(trimmed)
    );
  };

  const extractBulletText = (line: string): string => {
    const trimmed = line.trim();
    return trimmed
      .replace(/^[-•*]\s+/, "")
      .replace(/^\d+[\s.]\s+/, "")
      .replace(/^[a-z][\s.]\s+/, "");
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      pushParagraph();
      pushBullet();
      continue;
    }

    const isBulletStart = isBulletOrNumberedStart(line);

    if (isBulletStart) {
      pushParagraph();
      pushBullet();
      const bulletText = extractBulletText(line);
      currentBullet.push(bulletText);
    } else if (currentBullet.length > 0) {
      currentBullet.push(trimmed);
    } else {
      currentParagraph.push(trimmed);
    }
  }

  pushParagraph();
  pushBullet();

  return elements;
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];

  let value = bytes;
  let index = 0;

  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }

  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

function getInitials(user: User | null): string {
  const name =
    user?.username?.trim() ||
    user?.email?.split("@")[0] ||
    "U";

  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) =>
      part.charAt(0).toUpperCase(),
    )
    .join("");
}

function getDisplayName(user: User | null): string {
  if (user?.username?.trim()) {
    return user.username.trim();
  }

  if (user?.email) {
    return user.email.split("@")[0];
  }

  return "User";
}

// ============================================================
// ICONS
// ============================================================

function PlusIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 5V19"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M5 12H19"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 7H20"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M4 12H20"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M4 17H20"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M21 3L10.5 13.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M21 3L14.3 21L10.5 13.5L3 9L21 3Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="8"
        y="8"
        width="11"
        height="11"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M16 8V6C16 4.9 15.1 4 14 4H6C4.9 4 4 4.9 4 6V14C4 15.1 4.9 16 6 16H8"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function LogOutIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M10 4H6C4.9 4 4 4.9 4 6V18C4 19.1 4.9 20 6 20H10"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M14 8L18 12L14 16"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18 12H9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 16V4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M7 9L12 4L17 9"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 20H19"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M7 3H14L19 8V21H7C5.9 21 5 20.1 5 19V5C5 3.9 5.9 3 7 3Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M14 3V8H19"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type ChunkNode = {
  id: string;
  source_id: string;
  filename: string;
  chunk_index: number;
  preview: string;
};

type ChunkEdge = {
  source: string;
  target: string;
  type: "sequence" | "similarity";
};

type ChunkGraph = { nodes: ChunkNode[]; edges: ChunkEdge[] };

function hashColor(key: string) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return `hsl(${hash % 360}, 65%, 62%)`;
}

function KnowledgeGraph({ graph }: { graph: ChunkGraph }) {
  const width = 520;
  const height = 360;
  const cx = width / 2;
  const cy = height / 2;

  const bySource = new Map<string, ChunkNode[]>();
  graph.nodes.forEach((n) => {
    bySource.set(n.source_id, [...(bySource.get(n.source_id) ?? []), n]);
  });
  const groups = [...bySource.values()];

  const positions = new Map<string, { x: number; y: number }>();
  groups.forEach((group, gi) => {
    const gAngle = (gi / Math.max(groups.length, 1)) * 2 * Math.PI;
    const gx = cx + Math.cos(gAngle) * 150;
    const gy = cy + Math.sin(gAngle) * 110;
    const clusterRadius = Math.min(70, 18 + group.length * 6);
    group.forEach((n, i) => {
      const angle = (i / Math.max(group.length, 1)) * 2 * Math.PI;
      positions.set(n.id, {
        x: gx + Math.cos(angle) * clusterRadius,
        y: gy + Math.sin(angle) * clusterRadius,
      });
    });
  });

  if (graph.nodes.length === 0) {
    return <div className="empty-files">No chunks indexed yet.</div>;
  }

  return (
    <svg
      className="knowledge-graph"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Knowledge graph of document chunks"
    >
      {graph.edges.map((e, i) => {
        const a = positions.get(e.source);
        const b = positions.get(e.target);
        if (!a || !b) return null;
        return (
          <line
            key={`e-${i}`}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            className={
              e.type === "similarity" ? "graph-edge graph-edge-similarity" : "graph-edge"
            }
          />
        );
      })}
      {graph.nodes.map((n) => {
        const p = positions.get(n.id)!;
        return (
          <circle
            key={n.id}
            cx={p.x}
            cy={p.y}
            r={7}
            className="graph-node graph-node-file"
            fill={hashColor(n.source_id)}
          >
            <title>{`${n.filename} · chunk ${n.chunk_index}\n${n.preview}`}</title>
          </circle>
        );
      })}
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 7H20"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M10 11V17"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M14 11V17"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M6 7L7 20H17L18 7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M9 7V4H15V7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5 12L10 17L19 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M6 6L18 18"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M18 6L6 18"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 2L13.7 8.3L20 10L13.7 11.7L12 18L10.3 11.7L4 10L10.3 8.3L12 2Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function JarvisOrb({
  small = false,
}: {
  small?: boolean;
}) {
  return (
    <div
      className={
        small
          ? "jarvis-orb jarvis-orb-small"
          : "jarvis-orb"
      }
      aria-hidden="true"
    >
      <span />
    </div>
  );
}

// ============================================================
// COMPONENT
// ============================================================

export default function Chat() {
  const navigate = useNavigate();

  const [user, setUser] = useState<User | null>(
    getStoredUser(),
  );

  const [messages, setMessages] = useState<Message[]>(
    [],
  );

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [sidebarOpen, setSidebarOpen] =
    useState(false);

  const [conversations, setConversations] =
    useState<Conversation[]>([]);

  const [activeConversationId, setActiveConversationId] =
    useState<string | null>(() => {
      try {
        return localStorage.getItem("activeConversationId");
      } catch {
        return null;
      }
    });

  const [uploadOpen, setUploadOpen] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const [filesView, setFilesView] = useState<"list" | "graph">("list");
  const [chunkGraph, setChunkGraph] = useState<ChunkGraph | null>(null);
  const [globalOpen, setGlobalOpen] = useState(false);
  const [globalFiles, setGlobalFiles] = useState<KnowledgeFile[]>([]);
  const [globalUploading, setGlobalUploading] = useState(false);
  const [globalUploadProgress, setGlobalUploadProgress] = useState(0);

  const [pendingFiles, setPendingFiles] =
    useState<PendingFile[]>([]);

  const [knowledgeFiles, setKnowledgeFiles] =
    useState<KnowledgeFile[]>([]);

  const [uploading, setUploading] = useState(false);

  const fileInputRef =
    useRef<HTMLInputElement | null>(null);

  const textareaRef =
    useRef<HTMLTextAreaElement | null>(null);

  const messagesEndRef =
    useRef<HTMLDivElement | null>(null);

  // ============================================================
  // AUTH
  // ============================================================

  useEffect(() => {
    const token = getStoredToken();

    if (!token) {
      navigate("/login", {
        replace: true,
      });

      return;
    }

    const storedUser = getStoredUser();

    if (storedUser) {
      setUser(storedUser);
    }
  }, [navigate]);

  // ============================================================
  // AUTHENTICATED API
  // ============================================================

  const authenticatedFetch = useCallback(
    async (
      endpoint: string,
      options: RequestInit = {},
    ): Promise<Response> => {
      if (!API_URL) {
        throw new Error(
          "Backend API URL is not configured. Please check VITE_API_URL.",
        );
      }

      const token = getStoredToken();

      if (!token) {
        clearAuthentication();

        navigate("/login", {
          replace: true,
        });

        throw new Error(
          "Your session has expired. Please sign in again.",
        );
      }

      const response = await fetch(
        `${API_URL}${endpoint}`,
        {
          ...options,
          headers: {
            Authorization: `Bearer ${token}`,
            ...(options.headers || {}),
          },
        },
      );

      if (response.status === 401) {
        clearAuthentication();

        navigate("/login", {
          replace: true,
        });

        throw new Error(
          "Your session has expired. Please sign in again.",
        );
      }

      return response;
    },
    [navigate],
  );

  async function apiRequest<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const response = await authenticatedFetch(
      endpoint,
      options,
    );

    const data = await response
      .json()
      .catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data.detail ||
          data.message ||
          `Request failed (${response.status}).`,
      );
    }

    return data as T;
  }

  // ============================================================
  // LOAD CONVERSATIONS
  // ============================================================

  const refreshConversations = useCallback(
    async () => {
      try {
        const data =
          await apiRequest<Conversation[]>(
            "/conversations",
          );

        setConversations(data);
      } catch (err) {
        if (
          err instanceof Error &&
          err.message.includes("session has expired")
        ) {
          return;
        }

        setError(
          err instanceof Error
            ? err.message
            : "Could not load conversations.",
        );
      }
    },
    [authenticatedFetch],
  );

  // ============================================================
  // LOAD KNOWLEDGE FILES
  // ============================================================

  const refreshFiles = useCallback(
    async () => {
      try {
        const data =
          await apiRequest<KnowledgeFile[]>(
            "/files",
          );

        setKnowledgeFiles(data);
      } catch (err) {
        if (
          err instanceof Error &&
          err.message.includes("session has expired")
        ) {
          return;
        }

        setError(
          err instanceof Error
            ? err.message
            : "Could not load uploaded files.",
        );
      }
    },
    [authenticatedFetch],
  );

  useEffect(() => {
    const token = getStoredToken();

    if (!token) {
      return;
    }

    void refreshConversations();
    void refreshFiles();
  }, [refreshConversations, refreshFiles]);

  // ============================================================
  // PERSIST ACTIVE CONVERSATION
  // ============================================================

  useEffect(() => {
    try {
      if (activeConversationId) {
        localStorage.setItem(
          "activeConversationId",
          activeConversationId,
        );
      } else {
        localStorage.removeItem(
          "activeConversationId",
        );
      }
    } catch (e) {
      // localStorage not available
    }
  }, [activeConversationId]);

  // ============================================================
  // RESTORE CONVERSATION ON MOUNT
  // ============================================================

  useEffect(() => {
    if (
      activeConversationId &&
      messages.length === 0 &&
      conversations.length > 0
    ) {
      const exists = conversations.find(
        (c) => c.id === activeConversationId,
      );
      if (exists) {
        void handleSelectConversation(
          activeConversationId,
        );
      }
    }
  }, [conversations]);

  // ============================================================
  // AUTO-FOCUS INPUT
  // ============================================================

  useEffect(() => {
    textareaRef.current?.focus();
  }, [loading]);

  // ============================================================
  // SCROLL
  // ============================================================

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages, loading]);

  // ============================================================
  // TEXTAREA RESIZE
  // ============================================================

  useEffect(() => {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    textarea.style.height = "auto";

    textarea.style.height = `${Math.min(
      textarea.scrollHeight,
      180,
    )}px`;
  }, [input]);

  // ============================================================
  // NEW CONVERSATION
  // ============================================================

  function handleNewChat() {
    setMessages([]);
    setActiveConversationId(null);
    setInput("");
    setError("");
    setSidebarOpen(false);

    window.setTimeout(() => {
      textareaRef.current?.focus();
    }, 50);
  }

  // ============================================================
  // SELECT CONVERSATION
  // ============================================================

  async function handleSelectConversation(
    conversationId: string,
  ) {
    setError("");

    try {
      const conversation =
        await apiRequest<ConversationDetail>(
          `/conversations/${conversationId}`,
        );

      setActiveConversationId(
        conversation.id,
      );

      setMessages(
        conversation.messages.map(
          (message, index) => ({
            id: `${conversation.id}-${index}`,
            role: message.role,
            content: message.content,
            sources: message.sources || [],
            knowledgeCount:
              message.knowledge_count || 0,
            timestamp: message.created_at
              ? new Date(message.created_at)
              : new Date(),
          }),
        ),
      );

      setSidebarOpen(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not open conversation.",
      );
    }
  }

  // ============================================================
  // DELETE CONVERSATION
  // ============================================================

  async function handleDeleteConversation(
    event: MouseEvent,
    conversationId: string,
  ) {
    event.stopPropagation();

    const conversation =
      conversations.find(
        (item) => item.id === conversationId,
      );

    const confirmed = window.confirm(
      `Delete "${conversation?.title || "this conversation"}"?`,
    );

    if (!confirmed) {
      return;
    }

    try {
      await apiRequest(
        `/conversations/${conversationId}`,
        {
          method: "DELETE",
        },
      );

      if (
        conversationId ===
        activeConversationId
      ) {
        setMessages([]);
        setActiveConversationId(null);
        setInput("");
      }

      await refreshConversations();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not delete conversation.",
      );
    }
  }

  async function handleRenameConversation(
    event: MouseEvent,
    conversationId: string,
  ) {
    event.stopPropagation();

    const conversation = conversations.find(
      (item) => item.id === conversationId,
    );

    const title = window.prompt(
      "Rename conversation",
      conversation?.title || "",
    );

    if (!title || !title.trim()) {
      return;
    }

    try {
      await apiRequest(`/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() }),
      });

      await refreshConversations();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not rename conversation.",
      );
    }
  }

  // ============================================================
  // FILE SELECTION
  // ============================================================

  function addFiles(
    files: FileList | null,
  ) {
    if (!files) {
      return;
    }

    const selected = Array.from(files);

    setPendingFiles((current) => {
      const existing = new Set(
        current.map(
          (item) =>
            `${item.file.name}:${item.file.size}:${item.file.lastModified}`,
        ),
      );

      const newItems = selected
        .filter(
          (file) =>
            !existing.has(
              `${file.name}:${file.size}:${file.lastModified}`,
            ),
        )
        .map((file) => ({
          id: createId(),
          file,
          progress: 0,
          status: "ready" as const,
        }));

      return [...current, ...newItems];
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function removePendingFile(
    id: string,
  ) {
    setPendingFiles((current) =>
      current.filter(
        (item) => item.id !== id,
      ),
    );
  }

  function updatePendingFile(
    id: string,
    patch: Partial<Omit<PendingFile, "id" | "file">>,
  ) {
    setPendingFiles((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              ...patch,
            }
          : item,
      ),
    );
  }

  // ============================================================
  // UPLOAD SINGLE FILE
  // ============================================================

  function uploadSingleFile(
    item: PendingFile,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      if (!API_URL) {
        updatePendingFile(item.id, {
          status: "error",
          error:
            "Backend API URL is not configured.",
        });

        resolve(false);
        return;
      }

      const token = getStoredToken();

      if (!token) {
        clearAuthentication();

        navigate("/login", {
          replace: true,
        });

        updatePendingFile(item.id, {
          status: "error",
          error:
            "Your session has expired.",
        });

        resolve(false);
        return;
      }

      const request =
        new XMLHttpRequest();

      const form = new FormData();

      form.append(
        "file",
        item.file,
      );

      request.open(
        "POST",
        `${API_URL}/upload`,
      );

      request.setRequestHeader(
        "Authorization",
        `Bearer ${token}`,
      );

      request.upload.onloadstart = () => {
        updatePendingFile(item.id, {
          progress: 0,
          status: "uploading",
          error: undefined,
        });
      };

      request.upload.onprogress = (
        event,
      ) => {
        if (!event.lengthComputable) {
          return;
        }

        const progress = Math.min(
          100,
          Math.max(
            0,
            Math.round(
              (event.loaded / event.total) *
                100,
            ),
          ),
        );

        updatePendingFile(item.id, {
          progress,
          status: "uploading",
        });
      };

      request.onload = () => {
        if (
          request.status >= 200 &&
          request.status < 300
        ) {
          updatePendingFile(item.id, {
            progress: 100,
            status: "success",
            error: undefined,
          });

          resolve(true);
          return;
        }

        let detail =
          "Upload failed.";

        try {
          const data =
            JSON.parse(
              request.responseText,
            );

          detail =
            data.detail ||
            data.message ||
            detail;
        } catch {
          // Ignore invalid JSON.
        }

        if (request.status === 401) {
          clearAuthentication();

          navigate("/login", {
            replace: true,
          });
        }

        updatePendingFile(item.id, {
          status: "error",
          error: detail,
        });

        resolve(false);
      };

      request.onerror = () => {
        updatePendingFile(item.id, {
        status: "error",
        error:
        `Could not connect to ${API_URL}. ` +
        `Make sure the FastAPI backend is running and that VITE_API_URL is correct.`,
        });

        resolve(false);
      };

      request.onabort = () => {
        updatePendingFile(item.id, {
          status: "error",
          error: "Upload was cancelled.",
        });

        resolve(false);
      };

      updatePendingFile(item.id, {
        status: "uploading",
        progress: 0,
        error: undefined,
      });

      request.send(form);
    });
  }

  // ============================================================
  // UPLOAD ALL FILES
  // ============================================================

  async function handleUpload() {
    if (uploading) {
      return;
    }

    const queue = pendingFiles.filter(
      (item) =>
        item.status === "ready" ||
        item.status === "error",
    );

    if (queue.length === 0) {
      return;
    }

    setError("");

    // Put every queued file into the visible uploading state first.
    // This guarantees that the progress UI appears immediately, even
    // when a local/fast request finishes before a progress event fires.
    setPendingFiles((current) =>
      current.map((item) =>
        queue.some((queued) => queued.id === item.id)
          ? {
              ...item,
              status: "uploading",
              progress: 0,
              error: undefined,
            }
          : item,
      ),
    );

    setUploading(true);

    try {
      await Promise.all(
        queue.map((item) =>
          uploadSingleFile(item),
        ),
      );

      await refreshFiles();
    } finally {
      setUploading(false);
    }
  }

  // ============================================================
  // CLOSE UPLOAD MODAL
  // ============================================================

  function closeUploadModal() {
    if (uploading) {
      return;
    }

    setUploadOpen(false);

    const successfulIds = new Set(
      pendingFiles
        .filter(
          (item) =>
            item.status === "success",
        )
        .map((item) => item.id),
    );

    setPendingFiles((current) =>
      current.filter(
        (item) =>
          !successfulIds.has(item.id),
      ),
    );
  }

  // ============================================================
  // DELETE UPLOADED FILE
  // ============================================================

  async function handleDeleteUploadedFile(
    file: KnowledgeFile,
  ) {
    const confirmed = window.confirm(
      `Delete "${file.filename}"?`,
    );

    if (!confirmed) {
      return;
    }

    try {
      await apiRequest(
        `/files/${file.id}`,
        {
          method: "DELETE",
        },
      );

      await refreshFiles();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not delete uploaded file.",
      );
    }
  }

  // ============================================================
  // GLOBAL KNOWLEDGE
  // ============================================================

  async function refreshGlobalFiles() {
    try {
      const data = await apiRequest<KnowledgeFile[]>(
        "/files/global",
      );
      setGlobalFiles(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not load global files.",
      );
    }
  }

  async function handleGlobalUpload(
    fileList: FileList | null,
  ) {
    if (!fileList || fileList.length === 0) return;

    const totalFiles = fileList.length;
    setGlobalUploading(true);
    setGlobalUploadProgress(0);

    for (let i = 0; i < totalFiles; i++) {
      const file = fileList[i];
      const formData = new FormData();
      formData.append("file", file);

      try {
        await apiRequest("/upload/global", {
          method: "POST",
          body: formData,
        });

        setGlobalUploadProgress(
          Math.round(((i + 1) / totalFiles) * 100),
        );

        // Refresh immediately after each upload
        await refreshGlobalFiles();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Could not upload global file.",
        );
      }
    }

    setGlobalUploading(false);
    setGlobalUploadProgress(0);
  }

  async function handleDeleteGlobalFile(
    file: KnowledgeFile,
  ) {
    const confirmed = window.confirm(
      `Remove "${file.filename}" from global knowledge?`,
    );
    if (!confirmed) return;

    try {
      await apiRequest(`/files/global/${file.id}`, {
        method: "DELETE",
      });
      await refreshGlobalFiles();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not delete global file.",
      );
    }
  }

  // ============================================================
  // LOGOUT
  // ============================================================

  function handleLogout() {
    clearAuthentication();

    navigate("/login", {
      replace: true,
    });
  }

  // ============================================================
  // COPY
  // ============================================================

  async function handleCopy(
    content: string,
  ) {
    try {
      await navigator.clipboard.writeText(
        content,
      );
    } catch {
      // Clipboard may be unavailable.
    }
  }

  // ============================================================
  // SUBMIT QUERY
  // ============================================================

  async function handleSubmit(
  event?: FormEvent<HTMLFormElement>,
) {
  event?.preventDefault();

  if (loading) {
    return;
  }

  const query = input.trim();

  if (!query) {
    return;
  }

  if (query.length > MAX_QUERY_LENGTH) {
    setError(
      `Your message is too long. Please keep it under ${MAX_QUERY_LENGTH.toLocaleString()} characters.`,
    );

    return;
  }

  const token = getStoredToken();

  if (!token) {
    clearAuthentication();

    navigate("/login", {
      replace: true,
    });

    return;
  }

  if (!API_URL) {
    setError(
      "Backend API URL is not configured. Please check VITE_API_URL.",
    );

    return;
  }

  setError("");
  setInput("");

  // ----------------------------------------------------------
  // Add the user's message immediately.
  //
  // IMPORTANT:
  // This message must NOT be removed if the backend request
  // fails. The user should always be able to see what they sent.
  // ----------------------------------------------------------

  const userMessage: Message = {
    id: createId(),
    role: "user",
    content: query,
    timestamp: new Date(),
  };

  setMessages((current) => [
    ...current,
    userMessage,
  ]);

  setLoading(true);

  try {
    const response = await fetch(
      `${API_URL}/query`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },

        body: JSON.stringify({
          query,
          top_k: DEFAULT_TOP_K,
          conversation_id: activeConversationId,
        }),
      },
    );

    let data: Partial<QueryResponse> & {
      detail?: string;
      message?: string;
    } = {};

    try {
      data = await response.json();
    } catch {
      // The backend may return an empty/non-JSON response.
    }

    // --------------------------------------------------------
    // Authentication failure
    // --------------------------------------------------------

    if (response.status === 401) {
      clearAuthentication();

      navigate("/login", {
        replace: true,
      });

      return;
    }

    // --------------------------------------------------------
    // Backend error
    // --------------------------------------------------------

    if (!response.ok) {
      throw new Error(
        data.detail ||
          data.message ||
          `Request failed (${response.status}).`,
      );
    }

    // --------------------------------------------------------
    // Validate AI response
    // --------------------------------------------------------

    if (typeof data.answer !== "string") {
      throw new Error(
        "The server returned an invalid AI response.",
      );
    }

    // --------------------------------------------------------
    // Add assistant response
    // --------------------------------------------------------

    const assistantMessage: Message = {
      id: createId(),
      role: "assistant",
      content: data.answer,
      sources: data.sources || [],
      knowledgeCount:
        data.knowledge_count || 0,
      timestamp: new Date(),
    };

    setMessages((current) => [
      ...current,
      assistantMessage,
    ]);

    // --------------------------------------------------------
    // Save/use the conversation ID returned by backend
    // --------------------------------------------------------

    if (data.conversation_id) {
      setActiveConversationId(
        data.conversation_id,
      );
    }

    // --------------------------------------------------------
    // Refresh sidebar conversation list
    // --------------------------------------------------------

    await refreshConversations();

  } catch (err) {
    // --------------------------------------------------------
    // IMPORTANT FIX:
    //
    // DO NOT remove userMessage here.
    //
    // Previously this catch block deleted the user's message,
    // which made the message disappear whenever /query failed.
    //
    // The message now remains visible even when the backend
    // returns an error or the network connection fails.
    // --------------------------------------------------------

    setError(
      err instanceof Error
        ? err.message
        : "Unable to generate a response.",
    );

  } finally {
    setLoading(false);
  }
}

  // ============================================================
  // KEYBOARD
  // ============================================================

  function handleInputKeyDown(
    event: KeyboardEvent<HTMLTextAreaElement>,
  ) {
    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();

      if (!loading) {
        void handleSubmit();
      }
    }
  }

  // ============================================================
  // MODAL ESCAPE
  // ============================================================

  useEffect(() => {
    function handleEscape(
      event: globalThis.KeyboardEvent,
    ) {
      if (event.key !== "Escape") {
        return;
      }

      if (
        uploadOpen &&
        !uploading
      ) {
        closeUploadModal();
      }

      if (filesOpen) {
        setFilesOpen(false);
      }
    }

    window.addEventListener(
      "keydown",
      handleEscape,
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleEscape,
      );
    };
  }, [
    uploadOpen,
    filesOpen,
    uploading,
    pendingFiles,
  ]);

  // ============================================================
  // MODAL BODY LOCK
  // ============================================================

  useEffect(() => {
    if (
      uploadOpen ||
      filesOpen ||
      sidebarOpen
    ) {
      document.body.style.overflow =
        "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [
    uploadOpen,
    filesOpen,
    sidebarOpen,
  ]);

  const hasMessages =
    messages.length > 0;

  const hasUploadedFiles =
    knowledgeFiles.length > 0;

  const pendingUploadCount =
    pendingFiles.filter(
      (item) =>
        item.status === "ready" ||
        item.status === "error",
    ).length;

  return (
    <>
      <style>{`
        * {
          box-sizing: border-box;
        }

        :root {
          font-family:
            Inter,
            ui-sans-serif,
            system-ui,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;

          color: #f5f7fa;
          background: #08090b;

          font-synthesis: none;
          text-rendering: optimizeLegibility;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }

        html,
        body,
        #root {
          width: 100%;
          height: 100%;
          margin: 0;
        }

        body {
          min-width: 320px;
          min-height: 100vh;
          overflow: hidden;
          background: #08090b;
        }

        button,
        textarea,
        input {
          font-family: inherit;
        }

        button {
          -webkit-tap-highlight-color: transparent;
        }

        /* ========================================================
           APP
           ======================================================== */

        .jarvis-chat {
          width: 100%;
          height: 100vh;
          display: flex;
          overflow: hidden;

          background:
            radial-gradient(
              circle at 65% 18%,
              rgba(255,255,255,0.035),
              transparent 32%
            ),
            radial-gradient(
              circle at 15% 90%,
              rgba(255,255,255,0.025),
              transparent 28%
            ),
            #08090b;
        }

        /* ========================================================
           SIDEBAR
           ======================================================== */

        .chat-sidebar {
          position: relative;
          z-index: 30;

          width: 270px;
          height: 100vh;
          flex: 0 0 270px;

          display: flex;
          flex-direction: column;

          padding: 20px 15px;

          border-right:
            1px solid rgba(255,255,255,0.075);

          background:
            linear-gradient(
              180deg,
              rgba(255,255,255,0.025),
              rgba(255,255,255,0.008)
            );

          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
        }

        .sidebar-brand {
          display: flex;
          align-items: center;
          gap: 11px;
          padding: 4px 8px 22px;
        }

        .jarvis-orb {
          width: 34px;
          height: 34px;

          display: flex;
          align-items: center;
          justify-content: center;

          border:
            1px solid rgba(255,255,255,0.28);

          border-radius: 50%;
        }

        .jarvis-orb-small {
          width: 28px;
          height: 28px;
        }

        .jarvis-orb span {
          width: 9px;
          height: 9px;

          border-radius: 50%;

          background: #fff;

          box-shadow:
            0 0 12px rgba(255,255,255,0.85),
            0 0 28px rgba(255,255,255,0.25);
        }

        .jarvis-orb-small span {
          width: 8px;
          height: 8px;
        }

        .sidebar-brand-name {
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.28em;
        }

        .sidebar-brand-subtitle {
          margin-top: 2px;
          font-size: 8px;
          letter-spacing: 0.12em;
          color: rgba(255,255,255,0.3);
        }

        .new-chat-button,
        .sidebar-action-button {
          width: 100%;
          min-height: 42px;

          display: flex;
          align-items: center;
          gap: 9px;

          border:
            1px solid rgba(255,255,255,0.1);

          border-radius: 10px;

          background:
            rgba(255,255,255,0.04);

          color: rgba(255,255,255,0.82);

          font-size: 11px;
          font-weight: 600;

          cursor: pointer;

          transition:
            background 0.18s ease,
            border-color 0.18s ease,
            transform 0.18s ease;
        }

        .new-chat-button {
          justify-content: center;
        }

        .sidebar-action-button {
          margin-top: 7px;
          padding: 0 13px;
        }

        .new-chat-button:hover,
        .sidebar-action-button:hover {
          background:
            rgba(255,255,255,0.075);

          border-color:
            rgba(255,255,255,0.17);

          transform: translateY(-1px);
        }

        .sidebar-action-icon {
          width: 25px;
          height: 25px;

          display: flex;
          align-items: center;
          justify-content: center;

          border-radius: 7px;

          background:
            rgba(255,255,255,0.055);
        }

        .sidebar-section-label {
          margin: 25px 8px 9px;

          font-size: 8px;
          font-weight: 700;
          letter-spacing: 0.18em;

          color:
            rgba(255,255,255,0.25);
        }

        .conversation-list {
          min-height: 0;
          flex: 1;

          display: flex;
          flex-direction: column;
          gap: 3px;

          overflow-y: auto;
          overflow-x: hidden;

          padding-right: 2px;
        }

        .conversation-list::-webkit-scrollbar,
        .modal-scroll::-webkit-scrollbar {
          width: 5px;
        }

        .conversation-list::-webkit-scrollbar-thumb,
        .modal-scroll::-webkit-scrollbar-thumb {
          background:
            rgba(255,255,255,0.12);
          border-radius: 10px;
        }

        .conversation-item {
          width: 100%;
          min-height: 39px;

          display: flex;
          align-items: center;
          gap: 7px;

          padding: 7px 8px 7px 10px;

          border: 1px solid transparent;
          border-radius: 9px;

          background: transparent;

          color:
            rgba(255,255,255,0.58);

          text-align: left;

          cursor: pointer;
        }

        .conversation-item:hover {
          background:
            rgba(255,255,255,0.045);
          color:
            rgba(255,255,255,0.82);
        }

        .conversation-item.active {
          background:
            rgba(255,255,255,0.065);

          border-color:
            rgba(255,255,255,0.075);

          color: #fff;
        }

        .conversation-title {
          min-width: 0;
          flex: 1;

          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;

          font-size: 10px;
        }

        .conversation-delete {
          width: 25px;
          height: 25px;
          flex: 0 0 25px;

          display: flex;
          align-items: center;
          justify-content: center;

          border: 0;
          border-radius: 7px;

          background: transparent;
          color:
            rgba(255,255,255,0.25);

          cursor: pointer;
        }

        .conversation-delete:hover {
          background:
            rgba(255,255,255,0.08);
          color:
            rgba(255,255,255,0.9);
        }

        .sidebar-empty {
          padding: 10px 8px;

          font-size: 10px;
          line-height: 1.6;

          color:
            rgba(255,255,255,0.25);
        }

        .sidebar-bottom {
          margin-top: auto;
          padding-top: 14px;

          border-top:
            1px solid rgba(255,255,255,0.07);
        }

        .user-card {
          width: 100%;

          display: flex;
          align-items: center;
          gap: 10px;

          padding: 8px 7px;
        }

        .user-avatar {
          width: 32px;
          height: 32px;
          flex: 0 0 32px;

          display: flex;
          align-items: center;
          justify-content: center;

          border:
            1px solid rgba(255,255,255,0.14);

          border-radius: 50%;

          background:
            rgba(255,255,255,0.055);

          color:
            rgba(255,255,255,0.72);

          font-size: 10px;
          font-weight: 700;
        }

        .user-info {
          min-width: 0;
          flex: 1;
        }

        .user-name,
        .user-email {
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }

        .user-name {
          font-size: 11px;
          font-weight: 600;
          color:
            rgba(255,255,255,0.78);
        }

        .user-email {
          margin-top: 3px;
          font-size: 9px;
          color:
            rgba(255,255,255,0.3);
        }

        .logout-button {
          width: 31px;
          height: 31px;

          display: flex;
          align-items: center;
          justify-content: center;

          border:
            1px solid transparent;

          border-radius: 8px;

          background: transparent;

          color:
            rgba(255,255,255,0.35);

          cursor: pointer;
        }

        .logout-button:hover {
          border-color:
            rgba(255,255,255,0.08);

          background:
            rgba(255,255,255,0.05);

          color: #fff;
        }

        /* ========================================================
           MOBILE SIDEBAR
           ======================================================== */

        .sidebar-overlay {
          display: none;
        }

        /* ========================================================
           MAIN
           ======================================================== */

        .chat-main {
          min-width: 0;
          height: 100vh;
          flex: 1;

          display: flex;
          flex-direction: column;

          position: relative;
        }

        .chat-topbar {
          height: 67px;
          flex: 0 0 67px;

          display: flex;
          align-items: center;
          justify-content: space-between;

          padding: 0 30px;

          border-bottom:
            1px solid rgba(255,255,255,0.065);

          background:
            rgba(8,9,11,0.58);

          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
        }

        .mobile-menu-button {
          display: none;

          width: 37px;
          height: 37px;

          align-items: center;
          justify-content: center;

          border:
            1px solid rgba(255,255,255,0.09);

          border-radius: 9px;

          background:
            rgba(255,255,255,0.035);

          color:
            rgba(255,255,255,0.7);

          cursor: pointer;
        }

        .topbar-title {
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.15em;
          color:
            rgba(255,255,255,0.3);
        }

        .topbar-user {
          font-size: 10px;
          color:
            rgba(255,255,255,0.35);
        }

        /* ========================================================
           MESSAGES
           ======================================================== */

        .chat-content {
          min-height: 0;
          flex: 1;
          overflow-y: auto;
        }

        .messages-container {
          width: min(920px, calc(100% - 60px));
          min-height: 100%;

          margin: 0 auto;

          padding:
            35px 0
            40px;
        }

        .empty-state {
          min-height:
            calc(100vh - 170px);

          display: flex;
          align-items: center;
          justify-content: center;
        }

        .empty-state-inner {
          width: min(650px, 100%);
          text-align: center;
        }

        .empty-state-orb {
          display: flex;
          justify-content: center;
          margin-bottom: 22px;
        }

        .empty-state h1 {
          margin: 0;

          font-size: clamp(32px, 5vw, 48px);
          line-height: 1.1;
          letter-spacing: -0.04em;
        }

        .empty-state p {
          margin:
            14px auto
            28px;

          max-width: 520px;

          font-size: 12px;
          line-height: 1.7;

          color:
            rgba(255,255,255,0.35);
        }

        .suggestions {
          display: flex;
          justify-content: center;
          flex-wrap: wrap;
          gap: 8px;
        }

        .suggestion {
          padding:
            9px 12px;

          border:
            1px solid rgba(255,255,255,0.08);

          border-radius: 9px;

          background:
            rgba(255,255,255,0.025);

          color:
            rgba(255,255,255,0.45);

          font-size: 10px;

          cursor: pointer;
        }

        .suggestion:hover {
          background:
            rgba(255,255,255,0.06);

          color:
            rgba(255,255,255,0.8);
        }

        .message {
          display: flex;
          gap: 12px;

          margin-bottom: 30px;
        }

        .message-avatar {
          width: 32px;
          height: 32px;
          flex: 0 0 32px;

          display: flex;
          align-items: center;
          justify-content: center;
        }

        .message-avatar.user {
          border:
            1px solid rgba(255,255,255,0.1);

          border-radius: 50%;

          background:
            rgba(255,255,255,0.045);

          font-size: 9px;
          font-weight: 700;

          color:
            rgba(255,255,255,0.55);
        }

        .message-body {
          min-width: 0;
          flex: 1;
        }

        .message-header {
          height: 32px;

          display: flex;
          align-items: center;
          gap: 9px;
        }

        .message-role {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.05em;
        }

        .message-time {
          font-size: 8px;
          color:
            rgba(255,255,255,0.2);
        }

        .message-text {
          margin-top: 7px;

          font-size: 13px;
          line-height: 1.75;

          color:
            rgba(255,255,255,0.76);

          overflow-wrap: anywhere;
        }

        .message-text p {
          margin: 0 0 12px 0;
        }

        .message-text p:last-child {
          margin-bottom: 0;
        }

        .message-text strong {
          font-weight: 700;
          color:
            rgba(255,255,255,0.92);
        }

        .message-actions {
          margin-top: 9px;
        }

        .copy-button {
          width: 29px;
          height: 29px;

          display: flex;
          align-items: center;
          justify-content: center;

          border:
            1px solid transparent;

          border-radius: 7px;

          background: transparent;

          color:
            rgba(255,255,255,0.25);

          cursor: pointer;
        }

        .copy-button:hover {
          border-color:
            rgba(255,255,255,0.08);

          background:
            rgba(255,255,255,0.04);

          color:
            rgba(255,255,255,0.7);
        }

        .sources {
          margin-top: 16px;
          padding-top: 13px;

          border-top:
            1px solid rgba(255,255,255,0.055);
        }

        .sources-title {
          display: flex;
          align-items: center;
          gap: 6px;

          font-size: 8px;
          font-weight: 700;
          letter-spacing: 0.15em;

          color:
            rgba(255,255,255,0.3);
        }

        .sources-list {
          margin:
            8px 0 0;
          padding-left: 17px;

          color:
            rgba(255,255,255,0.38);

          font-size: 9px;
          line-height: 1.7;
        }

        .knowledge-count {
          margin-top: 7px;

          font-size: 8px;

          color:
            rgba(255,255,255,0.22);
        }

        .typing-message {
          display: flex;
          gap: 12px;
          margin-bottom: 30px;
        }

        .typing-dots {
          height: 32px;

          display: flex;
          align-items: center;
          gap: 4px;
        }

        .typing-dots span {
          width: 5px;
          height: 5px;

          border-radius: 50%;

          background:
            rgba(255,255,255,0.45);

          animation:
            typing 1.2s infinite ease-in-out;
        }

        .typing-dots span:nth-child(2) {
          animation-delay: 0.15s;
        }

        .typing-dots span:nth-child(3) {
          animation-delay: 0.3s;
        }

        @keyframes typing {
          0%, 60%, 100% {
            transform: translateY(0);
            opacity: 0.3;
          }

          30% {
            transform: translateY(-4px);
            opacity: 1;
          }
        }

        /* ========================================================
           ERROR
           ======================================================== */

        .chat-error {
          width: min(920px, calc(100% - 60px));
          margin: 0 auto 8px;

          padding:
            9px 12px;

          border:
            1px solid rgba(255,255,255,0.08);

          border-radius: 9px;

          background:
            rgba(255,255,255,0.035);

          color:
            rgba(255,255,255,0.6);

          font-size: 10px;
          line-height: 1.5;
        }

        /* ========================================================
           COMPOSER
           ======================================================== */

        .composer-area {
          padding:
            8px 30px
            22px;
        }

        .composer {
          width: min(920px, 100%);
          margin: 0 auto;

          border:
            1px solid rgba(255,255,255,0.1);

          border-radius: 17px;

          background:
            rgba(255,255,255,0.035);

          box-shadow:
            0 15px 60px rgba(0,0,0,0.25);
        }

        .composer:focus-within {
          border-color:
            rgba(255,255,255,0.18);
        }

        .composer-input-row {
          display: flex;
          align-items: flex-end;
          gap: 8px;

          padding:
            12px 12px 10px;
        }

        .composer textarea {
          min-height: 24px;
          max-height: 180px;

          flex: 1;

          resize: none;
          overflow-y: auto;

          border: 0;
          outline: 0;

          background: transparent;

          color: #f5f7fa;

          font-size: 13px;
          line-height: 1.55;
        }

        .composer textarea::placeholder {
          color:
            rgba(255,255,255,0.23);
        }

        .send-button {
          width: 34px;
          height: 34px;
          flex: 0 0 34px;

          display: flex;
          align-items: center;
          justify-content: center;

          border:
            1px solid rgba(255,255,255,0.12);

          border-radius: 9px;

          background:
            rgba(255,255,255,0.08);

          color:
            rgba(255,255,255,0.75);

          cursor: pointer;
        }

        .send-button:hover:not(:disabled) {
          background:
            rgba(255,255,255,0.14);
          color: #fff;
        }

        .send-button:disabled {
          opacity: 0.25;
          cursor: default;
        }

        .composer-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;

          padding:
            0 13px
            9px;
        }

        .composer-hint,
        .composer-counter {
          font-size: 8px;
          color:
            rgba(255,255,255,0.2);
        }

        /* ========================================================
           MODALS
           ======================================================== */

        .modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 100;

          display: flex;
          align-items: center;
          justify-content: center;

          padding: 20px;

          background:
            rgba(0,0,0,0.68);

          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }

        .modal {
          width: min(650px, 100%);
          max-height:
            min(760px, calc(100vh - 40px));

          display: flex;
          flex-direction: column;

          overflow: hidden;

          border:
            1px solid rgba(255,255,255,0.11);

          border-radius: 18px;

          background:
            linear-gradient(
              180deg,
              rgba(22,23,26,0.98),
              rgba(12,13,15,0.98)
            );

          box-shadow:
            0 30px 100px rgba(0,0,0,0.65);
        }

        .modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;

          padding:
            18px 20px;

          border-bottom:
            1px solid rgba(255,255,255,0.065);
        }

        .modal-heading {
          min-width: 0;
        }

        .modal-title {
          margin: 0;

          font-size: 15px;
          font-weight: 700;
        }

        .modal-subtitle {
          margin-top: 4px;

          font-size: 9px;

          color:
            rgba(255,255,255,0.32);
        }

        .modal-close {
          width: 32px;
          height: 32px;

          display: flex;
          align-items: center;
          justify-content: center;

          border:
            1px solid transparent;

          border-radius: 8px;

          background: transparent;

          color:
            rgba(255,255,255,0.4);

          cursor: pointer;
        }

        .modal-close:hover {
          border-color:
            rgba(255,255,255,0.08);

          background:
            rgba(255,255,255,0.05);

          color: #fff;
        }

        .modal-body {
          min-height: 0;
          overflow-y: auto;

          padding: 20px;
        }

        /* ========================================================
           UPLOAD MODAL
           ======================================================== */

        .file-picker {
          width: 100%;

          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;

          padding:
            32px 20px;

          border:
            1px dashed rgba(255,255,255,0.16);

          border-radius: 14px;

          background:
            rgba(255,255,255,0.025);
        }

        .file-picker:hover {
          border-color:
            rgba(255,255,255,0.25);

          background:
            rgba(255,255,255,0.04);
        }

        .file-picker-icon {
          width: 46px;
          height: 46px;

          display: flex;
          align-items: center;
          justify-content: center;

          border:
            1px solid rgba(255,255,255,0.1);

          border-radius: 13px;

          background:
            rgba(255,255,255,0.05);

          color:
            rgba(255,255,255,0.7);

          margin-bottom: 13px;
        }

        .file-picker-title {
          font-size: 12px;
          font-weight: 600;
        }

        .file-picker-description {
          margin-top: 5px;

          font-size: 9px;
          color:
            rgba(255,255,255,0.3);

          text-align: center;
        }

        .choose-files-button {
          margin-top: 17px;

          min-height: 38px;

          display: inline-flex;
          align-items: center;
          gap: 8px;

          padding:
            0 16px;

          border:
            1px solid rgba(255,255,255,0.13);

          border-radius: 9px;

          background:
            rgba(255,255,255,0.08);

          color:
            rgba(255,255,255,0.82);

          font-size: 10px;
          font-weight: 600;

          cursor: pointer;
        }

        .choose-files-button:hover {
          background:
            rgba(255,255,255,0.13);
          color: #fff;
        }

        .selected-files-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;

          margin:
            22px 0 9px;
        }

        .selected-files-title {
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.13em;

          color:
            rgba(255,255,255,0.35);
        }

        .selected-files-count {
          font-size: 9px;
          color:
            rgba(255,255,255,0.25);
        }

        .pending-list,
        .uploaded-list {
          display: flex;
          flex-direction: column;
          gap: 7px;
        }

        .files-view-toggle {
          display: flex;
          gap: 6px;
          padding: 0 20px 10px;
        }

        .view-toggle-button {
          padding: 5px 12px;
          font-size: 12px;
          border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.02);
          color: rgba(255,255,255,0.55);
          cursor: pointer;
        }

        .view-toggle-button.active {
          background: rgba(255,255,255,0.09);
          color: rgba(255,255,255,0.9);
          border-color: rgba(255,255,255,0.15);
        }

        .knowledge-graph {
          width: 100%;
          height: auto;
        }

        .graph-edge {
          stroke: rgba(255,255,255,0.12);
          stroke-width: 1;
        }

        .graph-edge-similarity {
          stroke: rgba(91,140,255,0.35);
          stroke-dasharray: 3 3;
        }

        .graph-node {
          stroke: rgba(255,255,255,0.2);
          stroke-width: 1;
        }

        .graph-node-center {
          fill: #5b8cff;
        }

        .graph-node-group {
          fill: rgba(91,140,255,0.5);
        }

        .graph-node-file {
          fill: rgba(255,255,255,0.35);
        }

        .graph-label {
          fill: rgba(255,255,255,0.7);
          font-size: 10px;
        }

        .graph-label-center {
          fill: #fff;
          font-size: 11px;
          font-weight: 600;
        }

        .pending-file,
        .uploaded-file {
          padding:
            11px 12px;

          border:
            1px solid rgba(255,255,255,0.065);

          border-radius: 11px;

          background:
            rgba(255,255,255,0.025);
        }

        .file-row {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .file-icon {
          width: 31px;
          height: 31px;
          flex: 0 0 31px;

          display: flex;
          align-items: center;
          justify-content: center;

          border-radius: 8px;

          background:
            rgba(255,255,255,0.055);

          color:
            rgba(255,255,255,0.55);
        }

        .file-info {
          min-width: 0;
          flex: 1;
        }

        .file-name {
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;

          font-size: 10px;
          font-weight: 600;

          color:
            rgba(255,255,255,0.72);
        }

        .file-meta {
          margin-top: 3px;

          font-size: 8px;

          color:
            rgba(255,255,255,0.27);
        }

        .file-remove {
          width: 28px;
          height: 28px;

          display: flex;
          align-items: center;
          justify-content: center;

          border: 0;
          border-radius: 7px;

          background: transparent;

          color:
            rgba(255,255,255,0.25);

          cursor: pointer;
        }

        .file-remove:hover {
          background:
            rgba(255,255,255,0.06);

          color:
            rgba(255,255,255,0.8);
        }

        .file-progress {
          margin-top: 9px;
        }

        .file-progress-track {
          width: 100%;
          height: 7px;

          overflow: hidden;

          border-radius: 10px;

          background:
            rgba(255,255,255,0.10);

          border:
            1px solid rgba(255,255,255,0.08);
        }

        .file-progress-bar {
          height: 100%;
          min-width: 0;

          border-radius: inherit;

          background:
            rgba(255,255,255,0.9);

          box-shadow:
            0 0 10px rgba(255,255,255,0.18);

          transition:
            width 0.15s ease;
        }

        .file-status-row {
          display: flex;
          align-items: center;
          justify-content: space-between;

          margin-top: 6px;

          font-size: 8px;
        }

        .file-status {
          color:
            rgba(255,255,255,0.35);
        }

        .file-status.success {
          display: flex;
          align-items: center;
          gap: 4px;

          color:
            rgba(255,255,255,0.7);
        }

        .file-status.error {
          color:
            rgba(255,255,255,0.62);
        }

        .file-progress-number {
          color:
            rgba(255,255,255,0.25);
        }

        .modal-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;

          padding:
            14px 20px;

          border-top:
            1px solid rgba(255,255,255,0.065);
        }

        .modal-footer-note {
          font-size: 8px;
          line-height: 1.4;

          color:
            rgba(255,255,255,0.24);
        }

        .modal-footer-actions {
          display: flex;
          gap: 8px;
        }

        .modal-secondary-button,
        .modal-primary-button {
          min-height: 36px;

          padding:
            0 14px;

          border-radius: 9px;

          font-size: 9px;
          font-weight: 600;

          cursor: pointer;
        }

        .modal-secondary-button {
          border:
            1px solid rgba(255,255,255,0.08);

          background:
            rgba(255,255,255,0.035);

          color:
            rgba(255,255,255,0.5);
        }

        .modal-primary-button {
          border:
            1px solid rgba(255,255,255,0.14);

          background:
            rgba(255,255,255,0.1);

          color:
            rgba(255,255,255,0.85);
        }

        .modal-primary-button:hover:not(:disabled) {
          background:
            rgba(255,255,255,0.16);

          color: #fff;
        }

        .modal-primary-button:disabled,
        .modal-secondary-button:disabled {
          opacity: 0.35;
          cursor: default;
        }

        .empty-files {
          padding: 40px 15px;
          text-align: center;

          font-size: 10px;
          line-height: 1.6;

          color:
            rgba(255,255,255,0.27);
        }

        .uploaded-file-delete {
          width: 30px;
          height: 30px;

          display: flex;
          align-items: center;
          justify-content: center;

          border:
            1px solid transparent;

          border-radius: 8px;

          background: transparent;

          color:
            rgba(255,255,255,0.25);

          cursor: pointer;
        }

        .uploaded-file-delete:hover {
          border-color:
            rgba(255,255,255,0.08);

          background:
            rgba(255,255,255,0.05);

          color:
            rgba(255,255,255,0.75);
        }

        .uploaded-status {
          display: inline-flex;
          align-items: center;

          margin-top: 5px;

          font-size: 8px;

          color:
            rgba(255,255,255,0.28);
        }

        /* ========================================================
           RESPONSIVE
           ======================================================== */

        @media (max-width: 850px) {
          .chat-sidebar {
            position: fixed;
            left: 0;
            top: 0;
            bottom: 0;

            transform:
              translateX(-105%);

            transition:
              transform 0.22s ease;

            box-shadow:
              15px 0 60px rgba(0,0,0,0.35);
          }

          .chat-sidebar.open {
            transform:
              translateX(0);
          }

          .sidebar-overlay {
            position: fixed;
            inset: 0;
            z-index: 25;

            display: block;

            border: 0;

            background:
              rgba(0,0,0,0.6);

            opacity: 0;
            pointer-events: none;

            transition:
              opacity 0.2s ease;
          }

          .sidebar-overlay.open {
            opacity: 1;
            pointer-events: auto;
          }

          .mobile-menu-button {
            display: flex;
          }

          .chat-topbar {
            padding:
              0 16px;
          }

          .topbar-user {
            display: none;
          }

          .messages-container {
            width:
              calc(100% - 32px);

            padding:
              28px 0
              30px;
          }

          .chat-error {
            width:
              calc(100% - 32px);
          }

          .composer-area {
            padding:
              8px 16px
              16px;
          }
        }

        @media (max-width: 550px) {
          .messages-container {
            width:
              calc(100% - 24px);
          }

          .message {
            gap: 9px;
            margin-bottom: 25px;
          }

          .message-avatar {
            width: 28px;
            height: 28px;
            flex-basis: 28px;
          }

          .message-header {
            height: 28px;
          }

          .message-text {
            font-size: 12px;
            line-height: 1.7;
          }

          .empty-state {
            min-height:
              calc(100vh - 210px);
          }

          .empty-state h1 {
            font-size: 31px;
          }

          .empty-state p {
            font-size: 11px;
          }

          .suggestions {
            flex-direction: column;
            align-items: stretch;
          }

          .suggestion {
            width: 100%;
          }

          .composer-area {
            padding-left: 10px;
            padding-right: 10px;
          }

          .composer {
            border-radius: 14px;
          }

          .composer-hint {
            display: none;
          }

          .composer-footer {
            justify-content: flex-end;
          }

          .modal-overlay {
            padding: 10px;
          }

          .modal {
            max-height:
              calc(100vh - 20px);
            border-radius: 15px;
          }

          .modal-header {
            padding:
              15px;
          }

          .modal-body {
            padding:
              15px;
          }

          .modal-footer {
            padding:
              12px 15px;
          }

          .modal-footer-note {
            display: none;
          }
        }
      `}</style>

      <div className="jarvis-chat">
        {/* ======================================================
            SIDEBAR
            ====================================================== */}

        <aside
          className={
            sidebarOpen
              ? "chat-sidebar open"
              : "chat-sidebar"
          }
        >
          <div className="sidebar-brand">
            <JarvisOrb small />

            <div>
              <div className="sidebar-brand-name">
                JARVIS
              </div>

              <div className="sidebar-brand-subtitle">
                PERSONAL AI
              </div>
            </div>
          </div>

          {/* NEW CHAT */}

          <button
            type="button"
            className="new-chat-button"
            onClick={handleNewChat}
          >
            <PlusIcon />
            <span>
              New conversation
            </span>
          </button>

          {/* UPLOAD FILES */}

          <button
            type="button"
            className="sidebar-action-button"
            onClick={() => {
              setUploadOpen(true);
              setFilesOpen(false);
              setError("");
            }}
          >
            <span className="sidebar-action-icon">
              <UploadIcon />
            </span>

            <span>
              Upload files
            </span>
          </button>

          {/* GLOBAL KNOWLEDGE */}

          <button
            type="button"
            className="sidebar-action-button"
            onClick={() => {
              setGlobalOpen(true);
              setUploadOpen(false);
              setFilesOpen(false);
              setError("");
              void refreshGlobalFiles();
            }}
          >
            <span className="sidebar-action-icon">
              <FileIcon />
            </span>
            <span>Global knowledge</span>
          </button>

          {/* SEE UPLOADED FILES */}

          {hasUploadedFiles && (
            <button
              type="button"
              className="sidebar-action-button"
              onClick={() => {
                setFilesOpen(true);
                setUploadOpen(false);
                setError("");
                void refreshFiles();
              }}
            >
              <span className="sidebar-action-icon">
                <FileIcon />
              </span>

              <span>
                See uploaded files
              </span>
            </button>
          )}

          {/* CONVERSATIONS */}

          <div className="sidebar-section-label">
            CONVERSATIONS
          </div>

          {conversations.length === 0 ? (
            <div className="sidebar-empty">
              Your conversations will
              appear here after you
              send your first message.
            </div>
          ) : (
            <div className="conversation-list">
              {conversations.map(
                (conversation) => (
                  <button
                    key={conversation.id}
                    type="button"
                    className={`conversation-item ${
                      conversation.id ===
                      activeConversationId
                        ? "active"
                        : ""
                    }`}
                    onClick={() =>
                      void handleSelectConversation(
                        conversation.id,
                      )
                    }
                  >
                    <span className="conversation-title">
                      {conversation.title}
                    </span>

                    <span
                      className="conversation-delete"
                      role="button"
                      tabIndex={0}
                      aria-label={`Rename ${conversation.title}`}
                      title="Rename conversation"
                      onClick={(event) =>
                        void handleRenameConversation(
                          event,
                          conversation.id,
                        )
                      }
                    >
                      ✎
                    </span>

                    <span
                      className="conversation-delete"
                      role="button"
                      tabIndex={0}
                      aria-label={`Delete ${conversation.title}`}
                      title="Delete conversation"
                      onClick={(event) =>
                        void handleDeleteConversation(
                          event,
                          conversation.id,
                        )
                      }
                      onKeyDown={(event) => {
                        if (
                          event.key ===
                            "Enter" ||
                          event.key ===
                            " "
                        ) {
                          event.preventDefault();

                          void handleDeleteConversation(
                            event as unknown as MouseEvent,
                            conversation.id,
                          );
                        }
                      }}
                    >
                      <TrashIcon />
                    </span>
                  </button>
                ),
              )}
            </div>
          )}

          {/* USER */}

          <div className="sidebar-bottom">
            <div className="user-card">
              <div className="user-avatar">
                {getInitials(user)}
              </div>

              <div className="user-info">
                <div className="user-name">
                  {getDisplayName(user)}
                </div>

                <div className="user-email">
                  {user?.email ||
                    "Authenticated user"}
                </div>
              </div>

              <button
                type="button"
                className="logout-button"
                onClick={handleLogout}
                title="Sign out"
                aria-label="Sign out"
              >
                <LogOutIcon />
              </button>
            </div>
          </div>
        </aside>

        {/* ======================================================
            MOBILE SIDEBAR OVERLAY
            ====================================================== */}

        <button
          type="button"
          className={
            sidebarOpen
              ? "sidebar-overlay open"
              : "sidebar-overlay"
          }
          onClick={() =>
            setSidebarOpen(false)
          }
          aria-label="Close menu"
        />

        {/* ======================================================
            MAIN CHAT
            ====================================================== */}

        <main className="chat-main">
          <header className="chat-topbar">
            <button
              type="button"
              className="mobile-menu-button"
              onClick={() =>
                setSidebarOpen(true)
              }
              aria-label="Open menu"
            >
              <MenuIcon />
            </button>

            <div className="topbar-title">
              {activeConversationId
                ? conversations.find(
                    (conversation) =>
                      conversation.id ===
                      activeConversationId,
                  )?.title ||
                  "CONVERSATION"
                : "JARVIS AI"}
            </div>

            <div className="topbar-user">
              {getDisplayName(user)}
            </div>
          </header>

          <div className="chat-content">
            <div className="messages-container">
              {!hasMessages ? (
                <div className="empty-state">
                  <div className="empty-state-inner">
                    <div className="empty-state-orb">
                      <JarvisOrb />
                    </div>

                    <h1>
                      How can I help?
                    </h1>

                    <p>
                      Ask Jarvis anything,
                      or upload your
                      knowledge files so
                      your conversations
                      can be grounded in
                      your own information.
                    </p>

                    <div className="suggestions">
                      <button
                        type="button"
                        className="suggestion"
                        onClick={() =>
                          setInput(
                            "Explain something to me step by step.",
                          )
                        }
                      >
                        Explain something
                      </button>

                      <button
                        type="button"
                        className="suggestion"
                        onClick={() =>
                          setInput(
                            "Help me analyze my documents.",
                          )
                        }
                      >
                        Analyze my documents
                      </button>

                      <button
                        type="button"
                        className="suggestion"
                        onClick={() =>
                          setInput(
                            "Help me create a plan.",
                          )
                        }
                      >
                        Create a plan
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {messages.map(
                    (message) => (
                      <article
                        key={message.id}
                        className="message"
                      >
                        <div
                          className={`message-avatar ${
                            message.role ===
                            "user"
                              ? "user"
                              : ""
                          }`}
                        >
                          {message.role ===
                          "user" ? (
                            getInitials(user)
                          ) : (
                            <JarvisOrb small />
                          )}
                        </div>

                        <div className="message-body">
                          <div className="message-header">
                            <span className="message-role">
                              {message.role ===
                              "user"
                                ? "YOU"
                                : "JARVIS"}
                            </span>

                            <span className="message-time">
                              {formatTime(
                                message.timestamp,
                              )}
                            </span>
                          </div>

                          <div className="message-text">
                            {renderMarkdownContent(
                              message.content,
                            )}
                          </div>

                          {message.role ===
                            "assistant" && (
                            <>
                              <div className="message-actions">
                                <button
                                  type="button"
                                  className="copy-button"
                                  onClick={() =>
                                    void handleCopy(
                                      message.content,
                                    )
                                  }
                                  title="Copy response"
                                  aria-label="Copy response"
                                >
                                  <CopyIcon />
                                </button>
                              </div>

                              {message.sources &&
                                message.sources
                                  .length >
                                  0 && (
                                  <div className="sources">
                                    <div className="sources-title">
                                      <SparkIcon />
                                      SOURCES
                                    </div>

                                    <ul className="sources-list">
                                      {message.sources.map(
                                        (
                                          source,
                                          index,
                                        ) => (
                                          <li
                                            key={`${message.id}-source-${index}`}
                                          >
                                            {source}
                                          </li>
                                        ),
                                      )}
                                    </ul>

                                    {typeof message.knowledgeCount ===
                                      "number" &&
                                      message.knowledgeCount >
                                        0 && (
                                        <div className="knowledge-count">
                                          {
                                            message.knowledgeCount
                                          }{" "}
                                          knowledge
                                          result
                                          {message.knowledgeCount ===
                                          1
                                            ? ""
                                            : "s"}{" "}
                                          used
                                        </div>
                                      )}
                                  </div>
                                )}
                            </>
                          )}
                        </div>
                      </article>
                    ),
                  )}

                  {loading && (
                    <div className="typing-message">
                      <div className="message-avatar">
                        <JarvisOrb small />
                      </div>

                      <div className="typing-dots">
                        <span />
                        <span />
                        <span />
                      </div>
                    </div>
                  )}

                  <div
                    ref={messagesEndRef}
                  />
                </>
              )}
            </div>
          </div>

          {/* ERROR */}

          {error && (
            <div className="chat-error">
              {error}
            </div>
          )}

          {/* COMPOSER */}

          <div className="composer-area">
            <form
              className="composer"
              onSubmit={handleSubmit}
            >
              <div className="composer-input-row">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(event) =>
                    setInput(
                      event.target.value,
                    )
                  }
                  onKeyDown={
                    handleInputKeyDown
                  }
                  placeholder="Message Jarvis..."
                  rows={1}
                  disabled={loading}
                  maxLength={
                    MAX_QUERY_LENGTH
                  }
                  autoComplete="off"
                  aria-label="Message Jarvis"
                />

                <button
                  type="submit"
                  className="send-button"
                  disabled={
                    loading ||
                    !input.trim()
                  }
                  aria-label="Send message"
                  title="Send message"
                >
                  <SendIcon />
                </button>
              </div>

              <div className="composer-footer">
                <span className="composer-hint">
                  Enter to send · Shift +
                  Enter for new line
                </span>

                <span className="composer-counter">
                  {input.length.toLocaleString()}{" "}
                  /{" "}
                  {MAX_QUERY_LENGTH.toLocaleString()}
                </span>
              </div>
            </form>
          </div>
        </main>
      </div>

      {/* ========================================================
          UPLOAD MODAL
          ======================================================== */}

      {uploadOpen && (
        <div
          className="modal-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (
              event.target ===
                event.currentTarget &&
              !uploading
            ) {
              closeUploadModal();
            }
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="upload-modal-title"
            onMouseDown={(event) =>
              event.stopPropagation()
            }
          >
            <div className="modal-header">
              <div className="modal-heading">
                <h2
                  id="upload-modal-title"
                  className="modal-title"
                >
                  Upload files
                </h2>

                <div className="modal-subtitle">
                  Add documents to Jarvis'
                  knowledge base.
                </div>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={closeUploadModal}
                disabled={uploading}
                aria-label="Close upload dialog"
                title="Close"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="modal-body">
              <div className="file-picker">
                <div className="file-picker-icon">
                  <UploadIcon />
                </div>

                <div className="file-picker-title">
                  Select files from your PC
                </div>

                <div className="file-picker-description">
                  Select one or multiple
                  supported knowledge files.
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  hidden
                  accept=".pdf,.docx,.xlsx,.xls,.pptx,.txt,.md,.csv,.html,.htm,.xml"
                  onChange={(event) =>
                    addFiles(
                      event.target.files,
                    )
                  }
                />

                <button
                  type="button"
                  className="choose-files-button"
                  onClick={() =>
                    fileInputRef.current?.click()
                  }
                  disabled={uploading}
                >
                  <FileIcon />
                  Select files
                </button>
              </div>

              {pendingFiles.length >
                0 && (
                <>
                  <div className="selected-files-heading">
                    <span className="selected-files-title">
                      SELECTED FILES
                    </span>

                    <span className="selected-files-count">
                      {pendingFiles.length}{" "}
                      file
                      {pendingFiles.length ===
                      1
                        ? ""
                        : "s"}
                    </span>
                  </div>

                  <div className="pending-list">
                    {pendingFiles.map(
                      (item) => (
                        <div
                          key={item.id}
                          className="pending-file"
                        >
                          <div className="file-row">
                            <div className="file-icon">
                              <FileIcon />
                            </div>

                            <div className="file-info">
                              <div className="file-name">
                                {item.file.name}
                              </div>

                              <div className="file-meta">
                                {formatFileSize(
                                  item.file.size,
                                )}
                              </div>
                            </div>

                            {item.status !==
                              "uploading" && (
                              <button
                                type="button"
                                className="file-remove"
                                onClick={() =>
                                  removePendingFile(
                                    item.id,
                                  )
                                }
                                disabled={
                                  uploading
                                }
                                title="Remove file"
                                aria-label={`Remove ${item.file.name}`}
                              >
                                <CloseIcon />
                              </button>
                            )}
                          </div>

                          {item.status !==
                            "ready" && (
                            <div
                              className="file-progress"
                              aria-live="polite"
                            >
                              <div className="file-progress-track">
                                <div
                                  className="file-progress-bar"
                                  style={{
                                    width: `${Math.max(
                                      0,
                                      Math.min(
                                        100,
                                        item.progress,
                                      ),
                                    )}%`,
                                  }}
                                />
                              </div>

                              <div className="file-status-row">
                                {item.status ===
                                  "success" ? (
                                  <span className="file-status success">
                                    <CheckIcon />
                                    Uploaded successfully
                                  </span>
                                ) : item.status ===
                                  "error" ? (
                                  <span className="file-status error">
                                    {item.error ||
                                      "Upload failed"}
                                  </span>
                                ) : (
                                  <span className="file-status">
                                    Uploading...
                                  </span>
                                )}

                                <span className="file-progress-number">
                                  {item.progress}%
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      ),
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="modal-footer">
              <div className="modal-footer-note">
                Files are stored privately
                for your account.
              </div>

              <div className="modal-footer-actions">
                <button
                  type="button"
                  className="modal-secondary-button"
                  onClick={closeUploadModal}
                  disabled={uploading}
                >
                  Close
                </button>

                <button
                  type="button"
                  className="modal-primary-button"
                  onClick={() =>
                    void handleUpload()
                  }
                  disabled={
                    uploading ||
                    pendingUploadCount ===
                      0
                  }
                >
                  {uploading
                    ? "Uploading..."
                    : `Upload ${
                        pendingUploadCount ||
                        ""
                      } file${
                        pendingUploadCount ===
                        1
                          ? ""
                          : "s"
                      }`}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ========================================================
          UPLOADED FILES MODAL
          ======================================================== */}

      {filesOpen && (
        <div
          className="modal-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              setFilesOpen(false);
            }
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="files-modal-title"
            onMouseDown={(event) =>
              event.stopPropagation()
            }
          >
            <div className="modal-header">
              <div className="modal-heading">
                <h2
                  id="files-modal-title"
                  className="modal-title"
                >
                  Uploaded files
                </h2>

                <div className="modal-subtitle">
                  Your private Jarvis
                  knowledge files.
                </div>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={() =>
                  setFilesOpen(false)
                }
                aria-label="Close uploaded files"
                title="Close"
              >
                <CloseIcon />
              </button>
            </div>

            {knowledgeFiles.length > 0 && (
              <div className="files-view-toggle">
                <button
                  type="button"
                  className={
                    filesView === "list"
                      ? "view-toggle-button active"
                      : "view-toggle-button"
                  }
                  onClick={() => setFilesView("list")}
                >
                  List
                </button>
                <button
                  type="button"
                  className={
                    filesView === "graph"
                      ? "view-toggle-button active"
                      : "view-toggle-button"
                  }
                  onClick={() => {
                    setFilesView("graph");
                    void apiRequest<ChunkGraph>(
                      "/files/graph",
                    ).then(setChunkGraph);
                  }}
                >
                  Graph
                </button>
              </div>
            )}

            <div className="modal-body modal-scroll">
              {knowledgeFiles.length ===
              0 ? (
                <div className="empty-files">
                  You have not uploaded any
                  knowledge files yet.
                </div>
              ) : filesView === "graph" ? (
                chunkGraph ? (
                  <KnowledgeGraph graph={chunkGraph} />
                ) : (
                  <div className="empty-files">Loading graph…</div>
                )
              ) : (
                <div className="uploaded-list">
                  {knowledgeFiles.map(
                    (file) => (
                      <div
                        key={file.id}
                        className="uploaded-file"
                      >
                        <div className="file-row">
                          <div className="file-icon">
                            <FileIcon />
                          </div>

                          <div className="file-info">
                            <div className="file-name">
                              {file.filename}
                            </div>

                            <div className="file-meta">
                              {formatFileSize(
                                file.file_size,
                              )}{" "}
                              ·{" "}
                              {file.file_type.toUpperCase()}
                            </div>

                            <div className="uploaded-status">
                              Status:{" "}
                              {file.status}
                            </div>
                          </div>

                          <button
                            type="button"
                            className="uploaded-file-delete"
                            onClick={() =>
                              void handleDeleteUploadedFile(
                                file,
                              )
                            }
                            title="Delete uploaded file"
                            aria-label={`Delete ${file.filename}`}
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      </div>
                    ),
                  )}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <div className="modal-footer-note">
                {knowledgeFiles.length}{" "}
                stored file
                {knowledgeFiles.length ===
                1
                  ? ""
                  : "s"}
              </div>

              <div className="modal-footer-actions">
                <button
                  type="button"
                  className="modal-primary-button"
                  onClick={() =>
                    setFilesOpen(false)
                  }
                >
                  Done
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ========================================================
          GLOBAL KNOWLEDGE MODAL
          ======================================================== */}

      {globalOpen && (
        <div
          className="modal-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setGlobalOpen(false);
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="global-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div className="modal-heading">
                <h2 id="global-modal-title" className="modal-title">
                  Global knowledge
                </h2>
                <div className="modal-subtitle">
                  Shared files used to train Jarvis for everyone.
                </div>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setGlobalOpen(false)}
                aria-label="Close global knowledge"
                title="Close"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="modal-body modal-scroll">
              <div style={{ marginBottom: "15px" }}>
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "8px 14px",
                    borderRadius: "8px",
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: globalUploading
                      ? "rgba(91,140,255,0.1)"
                      : "rgba(91,140,255,0.2)",
                    color: "#5b8cff",
                    fontWeight: 600,
                    fontSize: "11px",
                    cursor: globalUploading
                      ? "not-allowed"
                      : "pointer",
                    opacity: globalUploading ? 0.6 : 1,
                  }}
                >
                  📁 {globalUploading
                    ? `Uploading ${globalUploadProgress}%`
                    : "Upload file"}
                  <input
                    type="file"
                    hidden
                    disabled={globalUploading}
                    onChange={(event) => {
                      void handleGlobalUpload(event.target.files);
                      event.target.value = "";
                    }}
                    multiple
                  />
                </label>

                {globalUploading && (
                  <div
                    style={{
                      marginTop: "8px",
                      height: "4px",
                      background: "rgba(255,255,255,0.1)",
                      borderRadius: "2px",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        background: "#5b8cff",
                        width: `${globalUploadProgress}%`,
                        transition: "width 0.3s ease",
                      }}
                    />
                  </div>
                )}
              </div>

              {globalFiles.length === 0 ? (
                <div className="empty-files">No global files yet.</div>
              ) : (
                <div className="uploaded-list">
                  {globalFiles.map((file) => (
                    <div key={file.id} className="uploaded-file">
                      <div className="file-row">
                        <div className="file-icon">
                          <FileIcon />
                        </div>
                        <div className="file-info">
                          <div className="file-name">{file.filename}</div>
                          <div className="file-meta">
                            {formatFileSize(file.file_size)} · {file.file_type.toUpperCase()}
                          </div>
                          <div className="uploaded-status">Status: {file.status}</div>
                        </div>
                        <button
                          type="button"
                          className="uploaded-file-delete"
                          onClick={() => void handleDeleteGlobalFile(file)}
                          title="Remove from global knowledge"
                          aria-label={`Delete ${file.filename}`}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <div className="modal-footer-note">
                {globalFiles.length} global file{globalFiles.length === 1 ? "" : "s"}
              </div>
              <div className="modal-footer-actions">
                <button
                  type="button"
                  className="modal-primary-button"
                  onClick={() => setGlobalOpen(false)}
                >
                  Done
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}