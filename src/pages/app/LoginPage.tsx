import { useState } from "react";
import { Loader2, LogIn } from "lucide-react";
import { AuthLayout } from "@/components/app/AuthLayout";
import { api, ApiError } from "@/lib/api";
import { useRouter, Link } from "@/router/HashRouter";

export function LoginPage() {
  const { navigate } = useRouter();
  const [email, setEmail] = useState("admin@demo.vectorlearn.io");
  const [password, setPassword] = useState("demo123456");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      navigate("/app/dashboard");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "invalid_credentials") {
          setError("Email sau parolă incorectă.");
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
      title="Bine ai venit!"
      subtitle="Conectează-te în contul centrului tău"
      footer={
        <>
          Nu ai cont?{" "}
          <Link to="/app/signup" className="text-primary font-semibold hover:underline">
            Înregistrează-te
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-md bg-info/10 border border-info/30 px-3 py-2 text-xs text-info">
          <strong>Demo:</strong> credentialele admin@demo.vectorlearn.io / demo123456 sunt pre-completate
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-semibold mb-1.5">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-semibold mb-1.5">
            Parolă
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
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
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
          Conectare
        </button>
      </form>
    </AuthLayout>
  );
}
