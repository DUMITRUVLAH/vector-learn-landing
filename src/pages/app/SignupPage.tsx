import { useState } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { AuthLayout } from "@/components/app/AuthLayout";
import { api, ApiError } from "@/lib/api";
import { useRouter, Link } from "@/router/HashRouter";

export function SignupPage() {
  const { navigate } = useRouter();
  const [tenantName, setTenantName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({ tenantName, name, email, password }),
      });
      navigate("/app/dashboard");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "email_taken") {
          setError("Există deja un cont cu acest email.");
        } else {
          setError(`Eroare: ${err.code}`);
        }
      } else {
        setError("Nu pot conecta la server.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Creează cont nou"
      subtitle="Trial 14 zile, fără card de credit"
      footer={
        <>
          Ai deja cont?{" "}
          <Link to="/app/login" className="text-primary font-semibold hover:underline">
            Conectează-te
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="tenantName" className="block text-sm font-semibold mb-1.5">
            Numele centrului
          </label>
          <input
            id="tenantName"
            type="text"
            required
            minLength={2}
            placeholder="ex: Lingua School"
            value={tenantName}
            onChange={(e) => setTenantName(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          />
        </div>

        <div>
          <label htmlFor="signup-name" className="block text-sm font-semibold mb-1.5">
            Numele tău
          </label>
          <input
            id="signup-name"
            type="text"
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          />
        </div>

        <div>
          <label htmlFor="signup-email" className="block text-sm font-semibold mb-1.5">
            Email
          </label>
          <input
            id="signup-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          />
        </div>

        <div>
          <label htmlFor="signup-password" className="block text-sm font-semibold mb-1.5">
            Parolă <span className="font-normal text-muted-foreground">(min 8 caractere)</span>
          </label>
          <input
            id="signup-password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          />
        </div>

        {error && (
          <div role="alert" className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          Creează cont
        </button>

        <p className="text-[11px] text-muted-foreground text-center">
          Prin înregistrare ești de acord cu Termenii și Politica de confidențialitate.
        </p>
      </form>
    </AuthLayout>
  );
}
