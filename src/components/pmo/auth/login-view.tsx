"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, Eye, EyeOff, LogIn, ShieldCheck, ArrowRight } from "lucide-react";

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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await signIn("credentials", { username, password, redirect: false });
    setLoading(false);
    if (res?.error) {
      setError("نام کاربری یا رمز عبور نادرست است");
    } else if (res?.ok) {
      onSuccess?.();
    }
  }

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
                  placeholder="نام کاربری سازمانی"
                  className="h-10"
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
                    placeholder="••••••••"
                    className="h-10 pl-10"
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
                <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {error}
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
          <p className="font-medium text-foreground mb-1">کاربران نمونه (محیط توسعه):</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono">
            <span>admin / admin123</span>
            <span>(ادمین)</span>
            <span>manager1 / 123456</span>
            <span>(مدیر امور مشتریان)</span>
            <span>liaison1 / 123456</span>
            <span>(رابط)</span>
          </div>
        </div>

        <p className="text-center text-[11px] text-muted-foreground">
          © ۱۴۰۵ بیمه تجارت‌نو — سامانه مدیریت برنامه‌های سازمانی
        </p>
      </div>
    </div>
  );
}
