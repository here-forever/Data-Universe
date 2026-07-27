import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, KeyRound, ShieldCheck, Sparkles } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useI18n } from "../../i18n";
import { login } from "./api";

export function LoginPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("admin123");
  const loginMutation = useMutation({
    mutationFn: () => login(email, password),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      const from = (location.state as { from?: { pathname?: string } } | null)
        ?.from?.pathname;
      navigate(from && from !== "/login" ? from : "/", { replace: true });
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    loginMutation.mutate();
  }

  return (
    <main className="login-page">
      <div className="login-orb login-orb-one" aria-hidden="true" />
      <div className="login-orb login-orb-two" aria-hidden="true" />
      <section className="login-story">
        <span className="login-brand-mark">
          <Sparkles size={20} />
        </span>
        <p className="eyebrow">MISTFLOW DATA ATELIER</p>
        <h1>
          {t(
            "让每一次分析，都有来路与回响。",
            "Every analysis, traceable and trusted.",
          )}
        </h1>
        <p>
          {t(
            "进入本地优先的数据工作区，安全管理数据资产、协作成员与分析成果。",
            "Enter a local-first workspace for governed data, collaboration, and reusable analysis.",
          )}
        </p>
        <div className="login-trust-list">
          <span>
            <ShieldCheck size={17} />
            {t("有时效签名会话", "Expiring signed sessions")}
          </span>
          <span>
            <KeyRound size={17} />
            {t("加盐密码哈希", "Salted password hashing")}
          </span>
        </div>
      </section>

      <form className="login-card" onSubmit={handleSubmit}>
        <div>
          <p className="eyebrow">SECURE WORKSPACE</p>
          <h2>{t("欢迎回来", "Welcome back")}</h2>
          <p>
            {t("使用工作区账号继续。", "Continue with your workspace account.")}
          </p>
        </div>
        <label htmlFor="login-email">
          {t("邮箱", "Email")}
          <input
            autoComplete="username"
            id="login-email"
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
        </label>
        <label htmlFor="login-password">
          {t("密码", "Password")}
          <input
            autoComplete="current-password"
            id="login-password"
            minLength={1}
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </label>
        {loginMutation.isError ? (
          <p className="form-error" role="alert">
            {loginMutation.error.message}
          </p>
        ) : null}
        <button
          className="login-submit"
          disabled={loginMutation.isPending}
          type="submit"
        >
          {loginMutation.isPending
            ? t("正在验证…", "Signing in…")
            : t("进入工作区", "Enter workspace")}
          <ArrowRight size={17} />
        </button>
        <small>
          {t(
            "本地演示账号已预填；公开部署前请在环境变量中替换默认密码与应用密钥。",
            "Demo credentials are prefilled locally; replace the password and app secret before public deployment.",
          )}
        </small>
      </form>
    </main>
  );
}
