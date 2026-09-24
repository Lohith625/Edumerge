import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Clock3,
  AlertTriangle,
  Bell,
  CheckCircle2,
  GraduationCap,
  Layers3,
  LayoutDashboard,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  MessageSquare,
  Lock,
  Users,
  X,
} from "lucide-react";
import "./style.css";

type User = {
  id: number;
  name: string;
  email: string;
  role: "student" | "staff" | "manager";
  department: string | null;
};
type Ticket = {
  id: number;
  reference: string;
  subject: string;
  description: string;
  status: string;
  category: string;
  department: string;
  student: string;
  student_id: number;
  owner: string | null;
  owner_id: number | null;
  created_at: string;
  intake_details: { label: string; value: string }[];
  priority: string;
  reopen_count: number;
  sla_state: string;
  sla_percent: number;
  sla_due_at: string | null;
  cycle_number: number;
  comments?: {
    id: number;
    author: string;
    author_role: string;
    body: string;
    is_internal: boolean;
    created_at: string;
  }[];
  escalations?: {
    id: number;
    level: string;
    reason: string;
    created_at: string;
    acknowledged: boolean;
  }[];
  events?: { id: number; actor: string; message: string; created_at: string }[];
};
type Category = { id: number; name: string; department: string };
type Staff = {
  id: number;
  name: string;
  department_id: number;
  department: string;
};
type Report = {
  unassigned: number;
  at_risk: number;
  overdue: number;
  open_escalations: number;
  reopened: number;
  departments: {
    department: string;
    open: number;
    at_risk: number;
    overdue: number;
  }[];
  staff_workload: {
    staff: string;
    department: string;
    open: number;
    waiting: number;
    at_risk: number;
  }[];
};
type Triage = {
  suggested_category_id: number | null;
  suggested_category: string | null;
  reason: string;
  similar_tickets: Ticket[];
};
type Notice = {
  id: number;
  ticket_id: number;
  message: string;
  created_at: string;
  read: boolean;
};
const API_BASE =
  (import.meta as ImportMeta & { env?: { VITE_API_BASE?: string } }).env
    ?.VITE_API_BASE || "/api";
declare global {
  interface Window {
    google?: {
      accounts?: {
        id: {
          initialize: (options: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (element: HTMLElement, options: object) => void;
        };
      };
    };
  }
}
async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(API_BASE + path, {
    credentials: "include",
    ...(body !== undefined
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : "Please check the information and try again.",
    );
  return data;
}
const initials = (name: string) =>
  name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("");
const date = (value: string) =>
  new Date(value).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
function Badge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    open: "Open",
    in_progress: "In progress",
    waiting_for_student: "Waiting for student",
    resolved: "Resolved",
  };
  return (
    <span className={"badge " + status}>
      <span />
      {labels[status] || status}
    </span>
  );
}

function IntakeFields({ categoryId }: { categoryId: number }) {
  const [feeIssue, setFeeIssue] = useState("");
  const [cardIssue, setCardIssue] = useState("");
  useEffect(() => {
    setFeeIssue("");
    setCardIssue("");
  }, [categoryId]);
  if (!categoryId)
    return (
      <div className="intake-prompt">
        <CircleHelp size={19} />
        <span>
          Select a category to see the information that department needs.
        </span>
      </div>
    );
  const text = (
    name: string,
    label: string,
    placeholder: string,
    required = true,
  ) => (
    <label>
      {label}
      {!required && <span className="optional">Optional</span>}
      <input
        name={"intake_" + name}
        required={required}
        maxLength={500}
        placeholder={placeholder}
      />
    </label>
  );
  return (
    <fieldset className="intake-fields">
      <legend>Information needed for this request</legend>
      <p>
        Adding these details now helps staff resolve your request without
        another round of questions.
      </p>
      <div className="field-grid">
        {categoryId === 1 && (
          <>
            {text("roll_number", "Roll number", "Example: 23CS104")}
            {text("class_section", "Class / section", "Example: CSE 3B")}
            {text("subject_name", "Subject", "Example: Discrete Mathematics")}
            <label>
              Affected date
              <input name="intake_attendance_date" type="date" required />
            </label>
            {text("session", "Period / session", "Example: Period 2, 10:00 AM")}
            {text(
              "expected_correction",
              "Correction needed",
              "Example: Mark present instead of absent",
            )}
          </>
        )}
        {categoryId === 2 && (
          <>
            {text("roll_number", "Roll number", "Example: 23CS104")}
            {text("semester", "Semester", "Example: Semester 5")}
            {text(
              "fee_type",
              "Fee type",
              "Example: Tuition, hostel, examination",
            )}
            <label>
              Issue type
              <select
                name="intake_issue_type"
                required
                value={feeIssue}
                onChange={(e) => setFeeIssue(e.target.value)}
              >
                <option value="" disabled>
                  Select the issue
                </option>
                <option>General clarification</option>
                <option>Payment not reflected</option>
                <option>Incorrect amount</option>
                <option>Refund or reversal</option>
              </select>
            </label>
            {feeIssue && feeIssue !== "General clarification" && (
              <>
                {text(
                  "payment_date",
                  "Payment date",
                  "DD/MM/YYYY",
                  feeIssue !== "Incorrect amount",
                )}
                {text("amount", "Amount paid", "Example: INR 25,000")}
                {text(
                  "transaction_reference",
                  "Transaction reference",
                  "Bank or gateway reference",
                  feeIssue !== "Incorrect amount",
                )}
              </>
            )}
          </>
        )}
        {categoryId === 3 && (
          <>
            {text("roll_number", "Roll number", "Example: 23CS104")}
            {text("class_section", "Class / section", "Example: CSE 3B")}
            <label>
              ID card issue
              <select
                name="intake_issue_type"
                required
                value={cardIssue}
                onChange={(e) => setCardIssue(e.target.value)}
              >
                <option value="" disabled>
                  Select the issue
                </option>
                <option>First issue</option>
                <option>Lost card</option>
                <option>Damaged card</option>
                <option>Incorrect details</option>
              </select>
            </label>
            {cardIssue === "Incorrect details" &&
              text(
                "correction_details",
                "Details to correct",
                "Include the current and correct value",
              )}
          </>
        )}
        {categoryId === 4 && (
          <>
            {text("roll_number", "Roll number", "Example: 23CS104")}
            {text(
              "certificate_type",
              "Certificate type",
              "Example: Bonafide certificate",
            )}
            {text(
              "name_on_certificate",
              "Name on certificate",
              "Enter the exact spelling",
            )}
            {text("purpose", "Purpose", "Example: Internship application")}
            <label>
              Required by <span className="optional">Optional</span>
              <input name="intake_required_by" type="date" />
            </label>
          </>
        )}
      </div>
    </fieldset>
  );
}

function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [signup, setSignup] = useState(false);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("student@demo.edu");
  const [password, setPassword] = useState("Demo@12345");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const googleButton = useRef<HTMLDivElement>(null);
  const [googleLoading, setGoogleLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    const showGoogleButton = async () => {
      try {
        const config = await api<{ client_id: string }>("/auth/google/config");
        const render = () => {
          if (
            cancelled ||
            !googleButton.current ||
            !window.google?.accounts?.id
          )
            return;
          window.google.accounts.id.initialize({
            client_id: config.client_id,
            callback: async ({ credential }) => {
              setBusy(true);
              setError("");
              try {
                onLogin(await api<User>("/auth/google", { credential }));
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            },
          });
          googleButton.current.replaceChildren();
          window.google.accounts.id.renderButton(googleButton.current, {
            theme: "outline",
            size: "large",
            text: "continue_with",
            width: 365,
          });
          setGoogleLoading(false);
        };
        if (window.google?.accounts?.id) {
          render();
          return;
        }
        const existing = document.querySelector<HTMLScriptElement>(
          'script[src="https://accounts.google.com/gsi/client"]',
        );
        if (existing) {
          existing.addEventListener("load", render, { once: true });
        } else {
          const script = document.createElement("script");
          script.src = "https://accounts.google.com/gsi/client";
          script.async = true;
          script.onload = render;
          script.onerror = () => {
            if (!cancelled) {
              setGoogleLoading(false);
              setError(
                "Google sign-in could not load. Check your internet connection.",
              );
            }
          };
          document.head.append(script);
        }
      } catch (e) {
        if (!cancelled) {
          setGoogleLoading(false);
          setError((e as Error).message);
        }
      }
    };
    showGoogleButton();
    return () => {
      cancelled = true;
    };
  }, [onLogin]);
  return (
    <div className="login-page">
      <section className="login-story">
        <div className="brand">
          <span className="brand-icon">
            <GraduationCap />
          </span>
          edumerge<span className="brand-divider">/</span>
          <span className="brand-sub">support</span>
        </div>
        <div className="story-body">
          <span className="eyebrow">A LITTLE SUPPORT. A BIG DIFFERENCE.</span>
          <h1>
            Less waiting.
            <br />
            More clarity.
          </h1>
          <p>
            Your campus, connected. One place for student requests, clear
            ownership, and meaningful progress.
          </p>
          <div className="story-card">
            <span className="story-check">
              <Check size={20} />
            </span>
            <div>
              <strong>Every request has a next step.</strong>
              <p>From the first question to the right person.</p>
            </div>
          </div>
        </div>
        <div className="story-footer">
          Built around students. Supported by people.
        </div>
      </section>
      <section className="login-form-wrap">
        <form
          className="login-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              if (signup) {
                await api("/auth/signup", { name, email, password });
                setSignup(false);
                setMessage(
                  "Account created. Sign in with your new credentials.",
                );
              } else {
                onLogin(await api<User>("/auth/login", { email, password }));
              }
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <span className="pill">
            <ShieldCheck size={14} /> CAMPUS SUPPORT PORTAL
          </span>
          {signup && (
            <button
              type="button"
              className="back"
              onClick={() => {
                setSignup(false);
                setError("");
              }}
            >
              <ArrowLeft size={16} />
              Back to sign in
            </button>
          )}
          <h2>{signup ? "Create your account" : "Welcome back"}</h2>
          <p className="muted">
            {signup
              ? "Student registration for campus support."
              : "Sign in to your campus support workspace."}
          </p>
          {message && (
            <div className="success" role="status">
              {message}
            </div>
          )}
          <div className="google-auth">
            <div ref={googleButton} aria-label="Continue with Google" />
            {googleLoading && <small>Loading Google sign-in…</small>}
            <small>For student accounts only.</small>
          </div>
          <div className="auth-divider">
            <span>or continue with email</span>
          </div>
          {signup && (
            <label>
              Full name
              <input
                required
                minLength={2}
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            </label>
          )}
          <label>
            Email address
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              required
              minLength={signup ? 8 : 1}
              maxLength={200}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={signup ? "new-password" : "current-password"}
            />
          </label>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <button className="primary login-submit" disabled={busy}>
            {busy ? "Please wait..." : signup ? "Create account" : "Sign in"}
            <ArrowRight size={18} />
          </button>
          <p className="account-toggle">
            {signup ? "Already registered?" : "New student?"}{" "}
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setSignup(!signup);
                setEmail("");
                setPassword("");
                setError("");
                setMessage("");
              }}
            >
              {signup ? "Sign in instead" : "Create an account"}
            </button>
          </p>
          {!signup && (
            <div className="demo-box">
              <strong>Explore the demo</strong>
              <p>Choose a role to fill in its demo credentials.</p>
              <div className="role-buttons">
                {["student", "staff", "manager"].map((role) => (
                  <button
                    type="button"
                    className={email === role + "@demo.edu" ? "selected" : ""}
                    key={role}
                    onClick={() => {
                      setEmail(role + "@demo.edu");
                      setPassword("Demo@12345");
                    }}
                  >
                    {role}
                  </button>
                ))}
              </div>
              <small>Demo accounts only · No real student data</small>
            </div>
          )}
        </form>
      </section>
    </div>
  );
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [view, setView] = useState("all");
  const [profile, setProfile] = useState<User | null>(null);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [creating, setCreating] = useState(false);
  const [requestCategory, setRequestCategory] = useState(0);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [actionText, setActionText] = useState("");
  const [internalNote, setInternalNote] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [triage, setTriage] = useState<Triage | null>(null);
  const [requestSubject, setRequestSubject] = useState("");
  const [requestDescription, setRequestDescription] = useState("");
  const [notifications, setNotifications] = useState<Notice[]>([]);
  const refresh = async () => {
    setLoading(true);
    try {
      const [ts, cs] = await Promise.all([
        api<Ticket[]>("/tickets"),
        api<Category[]>("/categories"),
      ]);
      setTickets(ts);
      setCategories(cs);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    api<User>("/auth/me")
      .then(setUser)
      .catch(() => {})
      .finally(() => setBooting(false));
  }, []);
  useEffect(() => {
    if (user) refresh().catch((e) => setError(e.message));
  }, [user]);
  useEffect(() => {
    if (user?.role === "manager") {
      Promise.all([
        api<Report>("/reports/overview"),
        api<Staff[]>("/staff"),
        api<Notice[]>("/notifications"),
      ])
        .then(([overview, members, alerts]) => {
          setReport(overview);
          setStaff(members);
          setNotifications(alerts);
        })
        .catch((e) => setError(e.message));
    }
  }, [user, tickets.length]);
  async function openTicket(id: number) {
    setError("");
    try {
      setSelected(await api<Ticket>("/tickets/" + id));
      setActionText("");
      setInternalNote(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function navigate(next: string) {
    setProfile(null);
    setView(next);
    setSelected(null);
    setCreating(false);
    setRequestCategory(0);
    setTriage(null);
    setRequestSubject("");
    setRequestDescription("");
    setSearch("");
    setFilter("all");
    setError("");
    setNotice("");
  }
  async function logout() {
    try {
      await api("/auth/logout", {});
      setUser(null);
      setTickets([]);
      setProfile(null);
      setSelected(null);
      setCreating(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function showStudent(id: number) {
    try {
      setProfile(await api<User>("/students/" + id));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function claimTicket(id: number) {
    setBusy(true);
    setError("");
    try {
      await api("/tickets/" + id + "/claim", {});
      setNotice("You now own this request. The student can see your name.");
      if (selected?.id === id) await openTicket(id);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
      await refresh().catch(() => {});
      if (selected?.id === id) await openTicket(id);
    } finally {
      setBusy(false);
    }
  }
  async function ticketAction(path: string, body: unknown, success: string) {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      await api(`/tickets/${selected.id}/${path}`, body);
      await openTicket(selected.id);
      await refresh();
      if (user?.role === "manager")
        setReport(await api<Report>("/reports/overview"));
      setActionText("");
      setInternalNote(false);
      setNotice(success);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function runTriage() {
    setBusy(true);
    try {
      const result = await api<Triage>("/triage", {
        subject: requestSubject,
        description: requestDescription,
      });
      setTriage(result);
      if (result.suggested_category_id)
        setRequestCategory(result.suggested_category_id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (booting) return <div className="boot">Opening your workspace…</div>;
  if (!user)
    return (
      <Login
        onLogin={(u) => {
          setUser(u);
          navigate("all");
        }}
      />
    );
  const student = user.role === "student";
  const manager = user.role === "manager";
  const filtered = tickets.filter(
    (t) =>
      (view !== "mine" || t.owner_id === user.id) &&
      (filter === "all" ||
        (filter === "unassigned"
          ? !t.owner_id
          : filter === "at_risk" || filter === "overdue"
            ? t.sla_state === filter
            : t.status === filter)) &&
      `${t.subject} ${t.reference} ${t.category} ${t.student}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const title = student
    ? "My requests"
    : manager
      ? "Campus overview"
      : view === "mine"
        ? "My tickets"
        : "Department queue";
  const dashboardStats =
    manager && report
      ? [
          {
            label: "Unassigned",
            value: report.unassigned,
            icon: <Users size={20} />,
            caption: "Waiting for an owner",
            color: "amber",
          },
          {
            label: "At risk",
            value: report.at_risk,
            icon: <Clock3 size={20} />,
            caption: "70% or more of SLA used",
            color: "indigo",
          },
          {
            label: "Overdue",
            value: report.overdue,
            icon: <AlertTriangle size={20} />,
            caption: "Resolution deadline missed",
            color: "red",
          },
          {
            label: "Open escalations",
            value: report.open_escalations,
            icon: <Bell size={20} />,
            caption: "Need manager acknowledgement",
            color: "red",
          },
        ]
      : [
          {
            label: student ? "Total requests" : "Visible requests",
            value: tickets.length,
            icon: <Layers3 size={20} />,
            caption: student
              ? "Your campus support history"
              : "Across your permitted workspace",
            color: "indigo",
          },
          student
            ? {
                label: "Action needed",
                value: tickets.filter((t) => t.status === "waiting_for_student")
                  .length,
                icon: <MessageSquare size={20} />,
                caption: "Requests waiting for your reply",
                color: "amber",
              }
            : {
                label: "Awaiting ownership",
                value: tickets.filter(
                  (t) => !t.owner && t.status !== "resolved",
                ).length,
                icon: <Clock3 size={20} />,
                caption: "Ready for staff to pick up",
                color: "amber",
              },
          {
            label: "In progress",
            value: tickets.filter((t) => t.status === "in_progress").length,
            icon: <Users size={20} />,
            caption: "Assigned to a staff member",
            color: "green",
          },
        ];
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">
            <GraduationCap size={23} />
          </span>
          edumerge
        </div>
        <div className="workspace-label">CAMPUS SUPPORT</div>
        <nav>
          <span className="nav-label">WORKSPACE</span>
          <button
            className={
              view === "all" && !creating ? "nav-item active" : "nav-item"
            }
            onClick={() => navigate("all")}
          >
            {manager ? <LayoutDashboard size={19} /> : <Layers3 size={19} />}
            <span>
              {student
                ? "My requests"
                : manager
                  ? "Overview"
                  : "Department queue"}
            </span>
            <span className="nav-count">{tickets.length}</span>
          </button>
          {user.role === "staff" && (
            <button
              className={"nav-item " + (view === "mine" ? "active" : "")}
              onClick={() => navigate("mine")}
            >
              <ClipboardList size={19} />
              My tickets
            </button>
          )}
          {student && (
            <button
              className={"nav-item " + (creating ? "active" : "")}
              onClick={() => {
                setProfile(null);
                setCreating(true);
                setSelected(null);
                setError("");
                setNotice("");
              }}
            >
              <Plus size={19} />
              New request
            </button>
          )}
          {manager && (
            <button
              className={
                "nav-item " + (view === "notifications" ? "active" : "")
              }
              onClick={() => navigate("notifications")}
            >
              <Bell size={19} />
              Notifications
              {!!notifications.filter((item) => !item.read).length && (
                <span className="nav-count">
                  {notifications.filter((item) => !item.read).length}
                </span>
              )}
            </button>
          )}
          <button
            className={"nav-item " + (profile?.id === user.id ? "active" : "")}
            onClick={() => setProfile(user)}
          >
            <Users size={19} />
            My profile
          </button>
        </nav>
        <div className="sidebar-note">
          <CircleHelp size={22} />
          <strong>A clearer way forward</strong>
          <p>
            {student
              ? "Track your request and see who is helping, all in one place."
              : "Take ownership. Keep students informed. Make progress visible."}
          </p>
        </div>
        <div className="profile">
          <span className="avatar">{initials(user.name)}</span>
          <div>
            <strong>{user.name}</strong>
            <small>
              {user.role}
              {user.department ? " · " + user.department : ""}
            </small>
          </div>
          <button className="icon-button" title="Sign out" onClick={logout}>
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span>
            Workspace <ChevronRight size={14} />
            <strong>
              {profile
                ? "Profile"
                : creating
                  ? "New request"
                  : selected
                    ? selected.reference
                    : title}
            </strong>
          </span>
          <div className="topbar-right">
            <span className="demo-indicator" />
            Demo campus
            <span className="avatar small">{initials(user.name)}</span>
          </div>
        </header>
        <main>
          {error && (
            <div className="error" role="alert">
              {error}
              <button
                className="icon-button"
                onClick={() => setError("")}
                aria-label="Dismiss error"
              >
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="success" role="status">
              <Check size={17} />
              {notice}
            </div>
          )}
          {view === "notifications" ? (
            <>
              <button className="back" onClick={() => navigate("all")}>
                <ArrowLeft size={16} />
                Back to overview
              </button>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">MANAGER ALERTS</span>
                  <h1>
                    Notifications<span className="heading-dot">.</span>
                  </h1>
                  <p>Automatic alerts for unclaimed and overdue requests.</p>
                </div>
              </div>
              <section className="panel notification-list">
                {notifications.length ? (
                  notifications.map((item) => (
                    <button
                      className={item.read ? "read" : ""}
                      key={item.id}
                      onClick={async () => {
                        await api(`/notifications/${item.id}/read`, {});
                        setNotifications(
                          notifications.map((current) =>
                            current.id === item.id
                              ? { ...current, read: true }
                              : current,
                          ),
                        );
                        setView("all");
                        await openTicket(item.ticket_id);
                      }}
                    >
                      <span className="notification-icon">
                        <Bell size={17} />
                      </span>
                      <span>
                        <strong>{item.message}</strong>
                        <small>{date(item.created_at)}</small>
                      </span>
                      <ChevronRight size={17} />
                    </button>
                  ))
                ) : (
                  <div className="empty">
                    <Bell size={30} />
                    <h3>No notifications</h3>
                    <p>Automatic SLA alerts will appear here.</p>
                  </div>
                )}
              </section>
            </>
          ) : profile ? (
            <>
              <button className="back" onClick={() => setProfile(null)}>
                <ArrowLeft size={16} />
                {selected ? "Back to ticket" : "Back to workspace"}
              </button>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">CAMPUS ACCOUNT</span>
                  <h1>
                    {profile.id === user.id ? "My profile" : "Student profile"}
                  </h1>
                  <p>Account details and support activity.</p>
                </div>
              </div>
              <section className="panel profile-card">
                <span className="avatar">{initials(profile.name)}</span>
                <h2>{profile.name}</h2>
                <dl>
                  <dt>Email address</dt>
                  <dd>{profile.email}</dd>
                  <dt>Role</dt>
                  <dd className="capitalize">{profile.role}</dd>
                  {profile.department && (
                    <>
                      <dt>Department</dt>
                      <dd>{profile.department}</dd>
                    </>
                  )}
                  <dt>
                    {profile.role === "student"
                      ? "Student reference"
                      : "Account reference"}
                  </dt>
                  <dd>EM-U{String(profile.id).padStart(4, "0")}</dd>
                </dl>
                {profile.role === "student" && (
                  <>
                    <h2>
                      Requests{" "}
                      {user.role === "staff" ? "in your department" : ""}
                    </h2>
                    {tickets.filter((t) => t.student_id === profile.id)
                      .length ? (
                      tickets
                        .filter((t) => t.student_id === profile.id)
                        .map((t) => (
                          <button
                            className="profile-ticket"
                            key={t.id}
                            onClick={() => {
                              setProfile(null);
                              openTicket(t.id);
                            }}
                          >
                            {t.reference} / {t.subject}
                            <ChevronRight size={16} />
                          </button>
                        ))
                    ) : (
                      <p className="muted">No requests yet.</p>
                    )}
                  </>
                )}
                {profile.id === user.id && (
                  <button className="secondary" onClick={logout}>
                    <LogOut size={16} />
                    Sign out and use another account
                  </button>
                )}
              </section>
            </>
          ) : creating ? (
            <>
              <button
                className="back"
                onClick={() => {
                  setCreating(false);
                  setRequestCategory(0);
                }}
              >
                <ArrowLeft size={16} />
                Back to my requests
              </button>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">WE’RE HERE TO HELP</span>
                  <h1>Start a conversation</h1>
                  <p>
                    Tell us what you need. We’ll send it to the right
                    department.
                  </p>
                </div>
              </div>
              <form
                className="request-form panel"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const data = new FormData(e.currentTarget);
                  const intake = Object.fromEntries(
                    [...data.entries()]
                      .filter(([key]) => key.startsWith("intake_"))
                      .map(([key, value]) => [key.slice(7), String(value)]),
                  );
                  setBusy(true);
                  setError("");
                  try {
                    const ticket = await api<Ticket>("/tickets", {
                      subject: data.get("subject"),
                      description: data.get("description"),
                      category_id: Number(data.get("category")),
                      intake,
                    });
                    setCreating(false);
                    setRequestCategory(0);
                    await openTicket(ticket.id);
                    setNotice(
                      "Request submitted with the information staff need to begin.",
                    );
                    await refresh();
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <div className="triage-box">
                  <div>
                    <strong>
                      <Sparkles size={17} /> Smart request assistant
                    </strong>
                    <p>
                      Describe the issue, then let the system suggest a category
                      and check for similar open requests.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="secondary"
                    disabled={
                      busy ||
                      requestSubject.trim().length < 5 ||
                      requestDescription.trim().length < 10
                    }
                    onClick={runTriage}
                  >
                    <Sparkles size={16} /> Suggest category
                  </button>
                  {triage && (
                    <div className="triage-result">
                      <strong>
                        {triage.suggested_category
                          ? `Suggested: ${triage.suggested_category}`
                          : "Choose a category manually"}
                      </strong>
                      <span>{triage.reason}</span>
                      {triage.similar_tickets.length > 0 && (
                        <div className="duplicate-warning">
                          <AlertTriangle size={17} />
                          <div>
                            <strong>
                              Similar open request
                              {triage.similar_tickets.length > 1
                                ? "s"
                                : ""}{" "}
                              found
                            </strong>
                            <p>Check before creating another ticket.</p>
                            {triage.similar_tickets.map((ticket) => (
                              <button
                                type="button"
                                className="text-button"
                                key={ticket.id}
                                onClick={() => {
                                  setCreating(false);
                                  openTicket(ticket.id);
                                }}
                              >
                                {ticket.reference} · {ticket.subject}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <label>
                  What can we help with?
                  <select
                    name="category"
                    required
                    value={requestCategory || ""}
                    onChange={(e) => setRequestCategory(Number(e.target.value))}
                  >
                    <option value="" disabled>
                      Select a category
                    </option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} · {c.department}
                      </option>
                    ))}
                  </select>
                </label>
                <IntakeFields categoryId={requestCategory} />
                <label>
                  Subject
                  <input
                    name="subject"
                    value={requestSubject}
                    onChange={(e) => {
                      setRequestSubject(e.target.value);
                      setTriage(null);
                    }}
                    required
                    minLength={5}
                    maxLength={160}
                    placeholder="A short summary of your request"
                  />
                </label>
                <label>
                  Additional details
                  <textarea
                    name="description"
                    value={requestDescription}
                    onChange={(e) => {
                      setRequestDescription(e.target.value);
                      setTriage(null);
                    }}
                    required
                    minLength={20}
                    maxLength={5000}
                    rows={6}
                    placeholder="Add any context that will help the team understand your request."
                  />
                </label>
                <p className="form-hint">
                  Your request will be visible to you and authorized campus
                  staff.
                </p>
                <div className="form-actions">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setCreating(false);
                      setRequestCategory(0);
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    className="primary"
                    disabled={busy || !requestCategory}
                  >
                    {busy ? "Submitting…" : "Submit complete request"}
                    <ArrowRight size={16} />
                  </button>
                </div>
              </form>
            </>
          ) : selected ? (
            <>
              <button className="back" onClick={() => setSelected(null)}>
                <ArrowLeft size={16} />
                Back to {student ? "my requests" : "queue"}
              </button>
              <div className="detail-heading">
                <span className="eyebrow">
                  {selected.reference} <span className="dot-separator">·</span>{" "}
                  {selected.category}
                </span>
                <h1>{selected.subject}</h1>
                <Badge status={selected.status} />
              </div>
              <div className="detail-grid">
                <div>
                  <section className="panel">
                    <h2>Request details</h2>
                    <div className="author">
                      <span className="avatar small">
                        {initials(selected.student)}
                      </span>
                      <div>
                        {student ? (
                          <strong>{selected.student}</strong>
                        ) : (
                          <button
                            className="text-button"
                            onClick={() => showStudent(selected.student_id)}
                          >
                            {selected.student} / View student profile
                          </button>
                        )}
                        <small>{date(selected.created_at)}</small>
                      </div>
                    </div>
                    <p className="description">{selected.description}</p>
                    {!!selected.intake_details?.length && (
                      <div className="intake-summary">
                        <h2>Information provided</h2>
                        <dl>
                          {selected.intake_details.map((item) => (
                            <React.Fragment key={item.label}>
                              <dt>{item.label}</dt>
                              <dd>{item.value}</dd>
                            </React.Fragment>
                          ))}
                        </dl>
                      </div>
                    )}
                  </section>
                  <section className="panel conversation-panel">
                    <h2>
                      <MessageSquare size={18} /> Conversation
                    </h2>
                    <div className="conversation">
                      {selected.comments?.length ? (
                        selected.comments.map((comment) => (
                          <article
                            className={`message ${comment.author_role} ${comment.is_internal ? "internal" : ""}`}
                            key={comment.id}
                          >
                            <div className="message-head">
                              <strong>{comment.author}</strong>
                              {comment.is_internal && (
                                <span>
                                  <Lock size={12} />
                                  Internal note
                                </span>
                              )}
                              <time>{date(comment.created_at)}</time>
                            </div>
                            <p>{comment.body}</p>
                          </article>
                        ))
                      ) : (
                        <p className="empty-conversation">
                          No replies yet. The original request is shown above.
                        </p>
                      )}
                    </div>
                    {selected.status !== "resolved" &&
                      (student || selected.owner_id === user.id || manager) && (
                        <div className="reply-box">
                          <label>
                            {internalNote ? "Internal note" : "Write a reply"}
                            <textarea
                              value={actionText}
                              onChange={(e) => setActionText(e.target.value)}
                              rows={4}
                              placeholder={
                                internalNote
                                  ? "Visible only to staff and managers"
                                  : "Write a clear update for the student"
                              }
                            />
                          </label>
                          {!student && (
                            <label className="checkbox">
                              <input
                                type="checkbox"
                                checked={internalNote}
                                onChange={(e) =>
                                  setInternalNote(e.target.checked)
                                }
                              />
                              <Lock size={15} />
                              Internal note
                            </label>
                          )}
                          <div className="action-buttons">
                            <button
                              className="primary"
                              disabled={busy || actionText.trim().length < 2}
                              onClick={() =>
                                ticketAction(
                                  "comments",
                                  {
                                    body: actionText,
                                    is_internal: internalNote,
                                  },
                                  internalNote
                                    ? "Internal note added."
                                    : "Reply sent.",
                                )
                              }
                            >
                              <MessageSquare size={16} />
                              {internalNote ? "Add note" : "Send reply"}
                            </button>
                            {!student && !internalNote && (
                              <>
                                <button
                                  className="secondary"
                                  disabled={
                                    busy || actionText.trim().length < 2
                                  }
                                  onClick={() =>
                                    ticketAction(
                                      "request-info",
                                      { body: actionText },
                                      "Information requested. The SLA is paused.",
                                    )
                                  }
                                >
                                  <Clock3 size={16} />
                                  Request information
                                </button>
                                <button
                                  className="resolve-button"
                                  disabled={
                                    busy || actionText.trim().length < 2
                                  }
                                  onClick={() =>
                                    ticketAction(
                                      "resolve",
                                      { body: actionText },
                                      "Ticket resolved with a public resolution note.",
                                    )
                                  }
                                >
                                  <CheckCircle2 size={16} />
                                  Resolve
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    {student && selected.status === "resolved" && (
                      <div className="reply-box">
                        <label>
                          Why do you need more help?
                          <textarea
                            value={actionText}
                            onChange={(e) => setActionText(e.target.value)}
                            rows={3}
                            placeholder="Explain what remains unresolved"
                          />
                        </label>
                        <button
                          className="secondary"
                          disabled={busy || actionText.trim().length < 2}
                          onClick={() =>
                            ticketAction(
                              "reopen",
                              { body: actionText },
                              "Request reopened with a new SLA cycle.",
                            )
                          }
                        >
                          <RefreshCw size={16} />
                          Reopen request
                        </button>
                      </div>
                    )}
                  </section>
                  <section className="panel timeline-panel">
                    <h2>Activity timeline</h2>
                    <div className="timeline">
                      {selected.events?.map((event) => (
                        <div className="timeline-item" key={event.id}>
                          <span className="timeline-dot">
                            <Check size={12} />
                          </span>
                          <div>
                            <strong>{event.message}</strong>
                            <p>
                              {event.actor}{" "}
                              <span>· {date(event.created_at)}</span>
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
                <aside className="panel ownership">
                  <h2>Request information</h2>
                  <dl>
                    <dt>Department</dt>
                    <dd>{selected.department}</dd>
                    <dt>Assigned to</dt>
                    <dd>{selected.owner || "Awaiting staff ownership"}</dd>
                    <dt>Next action</dt>
                    <dd>
                      {selected.owner
                        ? "Staff to review your request"
                        : "Department staff to claim request"}
                    </dd>
                    <dt>Priority</dt>
                    <dd className={`priority ${selected.priority}`}>
                      {selected.priority}
                    </dd>
                    <dt>SLA</dt>
                    <dd>
                      <span className={`sla ${selected.sla_state}`}>
                        {selected.sla_state.replace("_", " ")}
                      </span>
                      {selected.sla_due_at && (
                        <small>
                          {selected.sla_percent}% used · due{" "}
                          {date(selected.sla_due_at)}
                        </small>
                      )}
                    </dd>
                    <dt>SLA cycle</dt>
                    <dd>
                      Cycle {selected.cycle_number}
                      {selected.reopen_count > 0
                        ? ` · reopened ${selected.reopen_count} time${selected.reopen_count > 1 ? "s" : ""}`
                        : ""}
                    </dd>
                  </dl>
                  {user.role === "staff" && !selected.owner && (
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() => claimTicket(selected.id)}
                    >
                      <Users size={16} />
                      {busy ? "Claiming…" : "Claim ticket"}
                    </button>
                  )}
                  {manager && (
                    <div className="manager-controls">
                      <h2>Manager controls</h2>
                      <label>
                        Assign staff
                        <select
                          value={selected.owner_id || ""}
                          onChange={(e) =>
                            ticketAction(
                              "reassign",
                              { owner_id: Number(e.target.value) },
                              "Ticket reassigned.",
                            )
                          }
                        >
                          <option value="" disabled>
                            Select staff
                          </option>
                          {staff
                            .filter(
                              (member) =>
                                member.department === selected.department,
                            )
                            .map((member) => (
                              <option value={member.id} key={member.id}>
                                {member.name}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label>
                        Priority
                        <select
                          value={selected.priority}
                          onChange={(e) =>
                            ticketAction(
                              "priority",
                              { priority: e.target.value },
                              "Priority updated.",
                            )
                          }
                        >
                          <option value="low">Low</option>
                          <option value="normal">Normal</option>
                          <option value="high">High</option>
                          <option value="urgent">Urgent</option>
                        </select>
                      </label>
                    </div>
                  )}
                  {manager && !!selected.escalations?.length && (
                    <div className="escalation-list">
                      <h2>Escalations</h2>
                      {selected.escalations.map((item) => (
                        <div key={item.id}>
                          <AlertTriangle size={16} />
                          <span>
                            <strong>{item.reason}</strong>
                            <small>{date(item.created_at)}</small>
                          </span>
                          {!item.acknowledged && (
                            <button
                              className="text-button"
                              onClick={async () => {
                                await api(
                                  `/escalations/${item.id}/acknowledge`,
                                  {},
                                );
                                await openTicket(selected.id);
                                setReport(
                                  await api<Report>("/reports/overview"),
                                );
                              }}
                            >
                              Acknowledge
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="info-note">
                    <ShieldCheck size={17} />
                    <p>
                      Ownership changes are recorded in the activity history.
                    </p>
                  </div>
                </aside>
              </div>
            </>
          ) : (
            <>
              {view === "mine" && (
                <button className="back" onClick={() => navigate("all")}>
                  <ArrowLeft size={16} />
                  Back to department queue
                </button>
              )}
              <div className="page-heading">
                <div>
                  <span className="eyebrow">
                    {student
                      ? "YOUR CAMPUS, CONNECTED"
                      : manager
                        ? "VISIBILITY ACROSS YOUR CAMPUS"
                        : user.department?.toUpperCase() + " WORKSPACE"}
                  </span>
                  <h1>
                    {title}
                    <span className="heading-dot">.</span>
                  </h1>
                  <p>
                    {student
                      ? "A little help, whenever you need it. Follow every request here."
                      : manager
                        ? "See where requests stand and which teams need support."
                        : "A shared queue. A clear owner. A better student experience."}
                  </p>
                </div>
                {student && (
                  <button
                    className="primary"
                    onClick={() => {
                      setProfile(null);
                      setCreating(true);
                      setNotice("");
                    }}
                  >
                    <Plus size={18} />
                    New request
                  </button>
                )}
              </div>
              <div className="stats-grid">
                {dashboardStats.map((stat) => (
                  <div className="stat panel" key={stat.label}>
                    <div className="stat-top">
                      <span>{stat.label}</span>
                      <span className={"stat-icon " + stat.color}>
                        {stat.icon}
                      </span>
                    </div>
                    <strong>{stat.value.toString().padStart(2, "0")}</strong>
                    <small>{stat.caption}</small>
                  </div>
                ))}
              </div>
              {manager && report && (
                <div className="manager-insights">
                  <section className="panel ageing-panel">
                    <div>
                      <h2>Department ageing view</h2>
                      <p>Open workload and SLA pressure by department.</p>
                    </div>
                    <div className="ageing-grid">
                      {report.departments.map((department) => (
                        <button
                          key={department.department}
                          onClick={() => setSearch(department.department)}
                        >
                          <strong>{department.department}</strong>
                          <span>{department.open} open</span>
                          <span className={department.overdue ? "danger" : ""}>
                            {department.overdue} overdue
                          </span>
                          <span>{department.at_risk} at risk</span>
                        </button>
                      ))}
                    </div>
                    <p className="reopened-metric">
                      <RefreshCw size={15} />
                      {report.reopened} ticket{report.reopened === 1 ? "" : "s"}{" "}
                      reopened after resolution
                    </p>
                  </section>
                  <section className="panel workload-panel">
                    <div>
                      <h2>Staff workload</h2>
                      <p>Current ownership, waiting work, and SLA pressure.</p>
                    </div>
                    <div className="workload-list">
                      {report.staff_workload.map((member) => (
                        <div key={member.staff}>
                          <span className="avatar small">
                            {initials(member.staff)}
                          </span>
                          <span className="workload-name">
                            <strong>{member.staff}</strong>
                            <small>{member.department}</small>
                          </span>
                          <span>{member.open} open</span>
                          <span className={member.waiting ? "warning" : ""}>
                            {member.waiting} waiting
                          </span>
                          <span className={member.at_risk ? "danger" : ""}>
                            {member.at_risk} at risk
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              )}
              <section className="panel queue-panel">
                <div className="queue-heading">
                  <div>
                    <h2>
                      {student
                        ? "Your requests and conversations"
                        : "Ticket queue"}
                    </h2>
                    <p>
                      {student
                        ? "Open any request to read updates and continue the conversation."
                        : user.role === "staff"
                          ? "Claim an unassigned ticket to start helping. Claimed tickets appear in My tickets."
                          : "Open a request to review details and ownership."}
                    </p>
                  </div>
                  <button
                    className="secondary refresh"
                    disabled={loading}
                    onClick={() => refresh().catch((e) => setError(e.message))}
                  >
                    <RefreshCw size={15} />
                    {loading ? "Refreshing…" : "Refresh"}
                  </button>
                </div>
                <div className="toolbar">
                  <div className="tabs">
                    {(student
                      ? [
                          ["all", "All requests"],
                          ["in_progress", "In progress"],
                          ["waiting_for_student", "Action needed"],
                          ["resolved", "Resolved"],
                        ]
                      : [
                          ["all", "All requests"],
                          ["unassigned", "Unassigned"],
                          ["in_progress", "In progress"],
                          ["waiting_for_student", "Waiting"],
                          ["at_risk", "At risk"],
                          ["overdue", "Overdue"],
                          ["resolved", "Resolved"],
                        ]
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        className={filter === value ? "active" : ""}
                        onClick={() => setFilter(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="search">
                    <Search size={17} />
                    <input
                      aria-label="Search requests"
                      placeholder="Search requests…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>REQUEST</th>
                        <th>STATUS</th>
                        {!student && <th>SLA</th>}
                        {!student && <th>DEPARTMENT</th>}
                        <th>ASSIGNED TO</th>
                        <th>CREATED</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((t) => (
                        <tr key={t.id}>
                          <td>
                            <span className="ticket-ref">
                              {t.reference} · {t.category}
                            </span>
                            <button
                              className="ticket-link"
                              onClick={() => openTicket(t.id)}
                            >
                              {t.subject}
                            </button>
                            {student && (
                              <button
                                className="conversation-link"
                                onClick={() => openTicket(t.id)}
                              >
                                <MessageSquare size={14} />
                                Open conversation
                              </button>
                            )}
                            {user.role === "staff" &&
                              !t.owner_id &&
                              t.status === "open" && (
                                <button
                                  className="primary queue-claim"
                                  disabled={busy}
                                  onClick={() => claimTicket(t.id)}
                                >
                                  <Users size={15} />
                                  {busy ? "Please wait..." : "Claim ticket"}
                                </button>
                              )}
                            {!student && (
                              <button
                                className="student-name text-button"
                                onClick={() => showStudent(t.student_id)}
                              >
                                {t.student} / Profile
                              </button>
                            )}
                          </td>
                          <td>
                            <Badge status={t.status} />
                          </td>
                          {!student && (
                            <td>
                              <span className={`sla ${t.sla_state}`}>
                                {t.sla_state.replace("_", " ")}
                              </span>
                            </td>
                          )}
                          {!student && <td>{t.department}</td>}
                          <td>
                            {t.owner ? (
                              <span className="owner-inline">
                                <span className="avatar tiny">
                                  {initials(t.owner)}
                                </span>
                                {t.owner}
                              </span>
                            ) : (
                              <span className="unassigned">Unassigned</span>
                            )}
                          </td>
                          <td className="date-cell">{date(t.created_at)}</td>
                          <td>
                            <button
                              className="icon-button"
                              aria-label={
                                student
                                  ? "Open conversation for " + t.reference
                                  : "Open " + t.reference
                              }
                              onClick={() => openTicket(t.id)}
                            >
                              <ChevronRight size={17} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!filtered.length && (
                  <div className="empty">
                    <ClipboardList size={30} />
                    <h3>
                      {loading ? "Loading requests…" : "No requests here yet"}
                    </h3>
                    <p>
                      {search || filter !== "all"
                        ? "Try another search or filter."
                        : student
                          ? "Start a new request when you need a hand."
                          : "New requests will appear in this queue."}
                    </p>
                  </div>
                )}
                <div className="table-footer">
                  {filtered.length} request{filtered.length !== 1 ? "s" : ""}
                  <span>
                    Visible only to authorized users <ShieldCheck size={13} />
                  </span>
                </div>
              </section>
              <div className="milestone-note">
                <span className="milestone-dot" />
                Complete workflow · Intake, ownership, conversation, SLA,
                escalation, and resolution
              </div>
            </>
          )}
        </main>
        <footer className="app-footer">
          edumerge support<span>A clearer campus experience.</span>
        </footer>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
