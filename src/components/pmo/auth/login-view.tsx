"use client";
import { useState, useCallback } from "react";
import { signIn, signOut } from "next-auth/react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, Eye, EyeOff, LogIn, ShieldCheck, ArrowRight, AlertCircle } from "lucide-react";

interface Props {
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function LoginView({ onSuccess, onCancel }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Trim and normalize inputs — prevents accidental Persian-space or trailing space issues
    const cleanUsername = username.trim();
    const cleanPassword = password;

    if (!cleanUsername || !cleanPassword) {
      setError("نام کاربری و رمز عبور را وارد کنید");
      return;
    }

    setLoading(true);
    try {
      // Clear any stale session cookie first (e.g. from before NEXTAUTH_SECRET was set).
      // signOut with redirect:false makes a POST to /api/auth/signout which clears the cookie,
      // then we immediately signIn with the new credentials. This ensures a clean session.
      try {
        await signOut({ redirect: false });
      } catch {
        // ignore — if there was no session, signOut is a no-op
      }

      // signIn from next-auth/react handles CSRF + cookie + everything automatically.
      // redirect: false returns a result object instead of redirecting.
      const result = await signIn("credentials", {
        username: cleanUsername,
        password: cleanPassword,
        redirect: false,
      });

      setLoading(false);

      // result = { error, status, ok, url }
      // - ok: true, error: null  → login succeeded
      // - error: "CredentialsSignin" → wrong username/password
      // - other error → server/network issue
      if (result?.error === "CredentialsSignin") {
        setError("نام کاربری یا رمز عبور نادرست است");
        return;
      }
      if (result?.error) {
        // Other errors (e.g. configuration, CSRF mismatch)
        setError("خطا در ورود: " + result.error);
        return;
      }
      if (result?.ok) {
        // Success — hard reload IMMEDIATELY so SessionProvider picks up the
        // new cookie on the fresh page load. We intentionally do NOT call
        // onSuccess() here, because that would flip mode="portal" in the
        // parent before the session is actually in the parent's state —
        // causing PortalApp to mount with an empty session, which briefly
        // renders the public dashboard (163 projects) before the portal.
        // Reloading is the cleanest way to re-initialize the session state.
        setLoading(false);
        // assign window.location.href via setTimeout(0) so the current
        // event handler completes before navigation starts.
        setTimeout(() => { window.location.href = "/"; }, 0);
        return;
      }
      // Fallback: unknown state
      setError("ورود ناموفق بود — دوباره تلاش کنید");
    } catch (err) {
      setLoading(false);
      setError("خطا در ارتباط با سرور");
    }
  }, [username, password, onSuccess]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 via-background to-emerald-50 dark:from-teal-950/30 dark:via-background dark:to-emerald-950/30 p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo header */}
        <div className="text-center space-y-3">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-lg">
            <ShieldCheck className="h-8 w-8" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">سامانه مدیریت برنامه‌های سازمانی</h1>
            <p className="text-sm text-muted-foreground mt-1">ورود به پورتال واحدها</p>
          </div>
        </div>

        <Card className="border-border/60 shadow-sm">
          <CardHeader className="space-y-1">
            <CardTitle className="text-lg flex items-center gap-2">
              <LogIn className="h-4 w-4 text-primary" />
              ورود به سیستم
            </CardTitle>
            <CardDescription>برای دسترسی به پروژه‌ها و گام‌های کاری وارد شوید</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">نام کاربری</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoFocus
                  required
                  autoComplete="username"
                  placeholder="نام کاربری سازمانی"
                  className="h-10"
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">رمز عبور</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPass ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="h-10 pl-10"
                    dir="ltr"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button type="submit" className="w-full h-10" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                    در حال ورود...
                  </>
                ) : (
                  <>
                    <LogIn className="ml-2 h-4 w-4" />
                    ورود
                  </>
                )}
              </Button>

              {onCancel && (
                <Button type="button" variant="ghost" className="w-full" onClick={onCancel}>
                  <ArrowRight className="ml-2 h-4 w-4" />
                  بازگشت به داشبورد عمومی
                </Button>
              )}
            </form>
          </CardContent>
        </Card>

        {/* Demo credentials hint */}
        <div className="rounded-lg border border-teal-200/60 bg-teal-50/50 dark:border-teal-900/40 dark:bg-teal-950/20 p-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground mb-2">رمزهای ورود (محیط توسعه):</p>
          <div className="space-y-1.5">
            <button
              type="button"
              onClick={() => { setUsername("admin"); setPassword("admin123"); }}
              className="w-full text-right rounded-md bg-white/60 dark:bg-white/5 px-2 py-1.5 hover:bg-white dark:hover:bg-white/10 transition-colors"
            >
              <span className="font-mono text-teal-700 dark:text-teal-300">admin</span>
              <span className="mx-1 text-muted-foreground">/</span>
              <span className="font-mono text-teal-700 dark:text-teal-300">admin123</span>
              <span className="text-muted-foreground mr-2">— مدیر سیستم</span>
            </button>
            <button
              type="button"
              onClick={() => { setUsername("manager1"); setPassword("123456"); }}
              className="w-full text-right rounded-md bg-white/60 dark:bg-white/5 px-2 py-1.5 hover:bg-white dark:hover:bg-white/10 transition-colors"
            >
              <span className="font-mono text-teal-700 dark:text-teal-300">manager1</span>
              <span className="mx-1 text-muted-foreground">/</span>
              <span className="font-mono text-teal-700 dark:text-teal-300">123456</span>
              <span className="text-muted-foreground mr-2">— مدیر امور مشتریان</span>
            </button>
            <button
              type="button"
              onClick={() => { setUsername("liaison1"); setPassword("123456"); }}
              className="w-full text-right rounded-md bg-white/60 dark:bg-white/5 px-2 py-1.5 hover:bg-white dark:hover:bg-white/10 transition-colors"
            >
              <span className="font-mono text-teal-700 dark:text-teal-300">liaison1</span>
              <span className="mx-1 text-muted-foreground">/</span>
              <span className="font-mono text-teal-700 dark:text-teal-300">123456</span>
              <span className="text-muted-foreground mr-2">— رابط امور مشتریان</span>
            </button>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">برای پر کردن سریع، روی هر ردیف کلیک کنید</p>
        </div>

        <p className="text-center text-[11px] text-muted-foreground">
          © ۱۴۰۵ بیمه تجارت‌نو — سامانه مدیریت برنامه‌های سازمانی
        </p>
      </div>
    </div>
  );
}
