"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { 
  ShieldCheck, 
  Mail, 
  Lock, 
  User, 
  AlertCircle, 
  CheckCircle2, 
  Loader2 
} from "lucide-react";
import { ACCOUNTS_SERVICE_URL } from "../../config";
import styles from "./login.module.css";
import PanelLoadingSpinner from "../../components/PanelLoadingSpinnerComponent";

function LogInContentComponent() {
  const router = useRouter();
  const searchParameters = useSearchParams();
  
  // Resolve redirect destination (defaults to workspace chat)
  const callbackUrl = searchParameters?.get("callbackUrl") || "/chat";
  const sessionError = searchParameters?.get("error");

  const [isSignUpMode, setIsSignUpMode] = useState(false);
  const [emailValue, setEmailValue] = useState("");
  const [usernameValue, setUsernameValue] = useState("");
  const [passwordValue, setPasswordValue] = useState("");
  const [displayNameValue, setDisplayNameValue] = useState("");
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alertError, setAlertError] = useState("");
  const [alertSuccess, setAlertSuccess] = useState("");

  // Map default NextAuth error codes to beautiful messages
  useEffect(() => {
    if (sessionError) {
      if (sessionError === "OAuthSignin" || sessionError === "OAuthCallback") {
        setAlertError("An error occurred during Google SSO. Please try again.");
      } else if (sessionError === "AccessDenied") {
        setAlertError("Access denied. Your email address is not in the allowed list.");
      } else {
        setAlertError("Authentication failed. Please verify your credentials.");
      }
    }
  }, [sessionError]);

  // Sync mode from search parameters
  useEffect(() => {
    const mode = searchParameters?.get("mode");
    if (mode === "signup") {
      setIsSignUpMode(true);
    } else if (mode === "login") {
      setIsSignUpMode(false);
    }
  }, [searchParameters]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setAlertError("");
    setAlertSuccess("");
    setIsSubmitting(true);

    if (isSignUpMode) {
      // --- Sign Up Flow -----------------------------------------------
      try {
        const signUpResponse = await fetch(`${ACCOUNTS_SERVICE_URL}/auth/signup`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: emailValue,
            username: usernameValue,
            password: passwordValue,
            name: displayNameValue || undefined,
          }),
        });

        const data = await signUpResponse.json();

        if (!signUpResponse.ok) {
          throw new Error(data.message || "Registration failed");
        }

        setAlertSuccess("Account created successfully! Logging you in...");

        // Auto-login immediately after successful signup
        const signInResult = await signIn("credentials", {
          email: emailValue,
          password: passwordValue,
          redirect: false,
        });

        if (signInResult?.error) {
          throw new Error("Account created, but automatic login failed. Please sign in manually.");
        }

        router.push(callbackUrl);
        router.refresh();
      } catch (error: unknown) {
        setAlertError(error instanceof Error ? error.message : "An unexpected error occurred");
        setIsSubmitting(false);
      }
    } else {
      // --- Log In Flow ------------------------------------------------
      try {
        const signInResult = await signIn("credentials", {
          email: emailValue,
          password: passwordValue,
          redirect: false,
        });

        if (signInResult?.error) {
          throw new Error("Invalid email or password");
        }

        router.push(callbackUrl);
        router.refresh();
      } catch (error: unknown) {
        setAlertError(error instanceof Error ? error.message : "Authentication failed");
        setIsSubmitting(false);
      }
    }
  };

  const handleGoogleSignIn = () => {
    setAlertError("");
    setAlertSuccess("");
    signIn("google", { callbackUrl });
  };

  return (
    <main className={styles['login-page-container']}>
      <section className={styles['authentication-card']}>
        {/* Brand Header */}
        <header className={styles['brand-section-header']}>
          <div className={styles['brand-logo-container']} aria-hidden="true">
            <ShieldCheck size={28} />
          </div>
          <h1 className={styles["mainHeading-element"]}>
            {isSignUpMode ? "Create Account" : "Welcome Back"}
          </h1>
          <p className={styles['subheading-paragraph']}>
            {isSignUpMode 
              ? "Register to access your workspace clients" 
              : "Sign in to access your unified gateway"}
          </p>
        </header>

        {/* Status Alerts */}
        {alertError && (
          <div className={styles['error-message-alert']} role="alert">
            <AlertCircle size={18} />
            <span>{alertError}</span>
          </div>
        )}

        {alertSuccess && (
          <div className={styles['success-message-alert']} role="alert">
            <CheckCircle2 size={18} />
            <span>{alertSuccess}</span>
          </div>
        )}

        {/* Dynamic Form */}
        <form onSubmit={handleSubmit}>
          {isSignUpMode && (
            <>
              {/* Display Name (Optional) */}
              <div className={styles['form-group-container']}>
                <label className={styles['label-element']} htmlFor="display-name-input">
                  Display Name
                </label>
                <div style={{ position: "relative" }}>
                  <User 
                    size={16} 
                    style={{ 
                      position: "absolute", 
                      insetInlineStart: "16px", 
                      insetBlockStart: "50%", 
                      transform: "translateY(-50%)", 
                      color: "oklch(0.5 0 0)" 
                    }} 
                  />
                  <input
                    id="display-name-input"
                    type="text"
                    placeholder="John Doe"
                    value={displayNameValue}
                    onChange={(e) => setDisplayNameValue(e.target.value)}
                    className={styles["inputText-field"]}
                    style={{ paddingInlineStart: "44px" }}
                  />
                </div>
              </div>

              {/* Username (Required for Registration) */}
              <div className={styles['form-group-container']}>
                <label className={styles['label-element']} htmlFor="username-input">
                  Username
                </label>
                <div style={{ position: "relative" }}>
                  <User 
                    size={16} 
                    style={{ 
                      position: "absolute", 
                      insetInlineStart: "16px", 
                      insetBlockStart: "50%", 
                      transform: "translateY(-50%)", 
                      color: "oklch(0.5 0 0)" 
                    }} 
                  />
                  <input
                    id="username-input"
                    type="text"
                    required
                    placeholder="johndoe"
                    value={usernameValue}
                    onChange={(e) => setUsernameValue(e.target.value)}
                    className={styles["inputText-field"]}
                    style={{ paddingInlineStart: "44px" }}
                  />
                </div>
              </div>
            </>
          )}

          {/* Email Address */}
          <div className={styles['form-group-container']}>
            <label className={styles['label-element']} htmlFor="email-input">
              Email Address
            </label>
            <div style={{ position: "relative" }}>
              <Mail 
                size={16} 
                style={{ 
                  position: "absolute", 
                  insetInlineStart: "16px", 
                  insetBlockStart: "50%", 
                  transform: "translateY(-50%)", 
                  color: "oklch(0.5 0 0)" 
                }} 
              />
              <input
                id="email-input"
                type="email"
                required
                placeholder="you@domain.com"
                value={emailValue}
                onChange={(e) => setEmailValue(e.target.value)}
                className={styles["inputText-field"]}
                style={{ paddingInlineStart: "44px" }}
              />
            </div>
          </div>

          {/* Password */}
          <div className={styles['form-group-container']}>
            <label className={styles['label-element']} htmlFor="password-input">
              Password
            </label>
            <div style={{ position: "relative" }}>
              <Lock 
                size={16} 
                style={{ 
                  position: "absolute", 
                  insetInlineStart: "16px", 
                  insetBlockStart: "50%", 
                  transform: "translateY(-50%)", 
                  color: "oklch(0.5 0 0)" 
                }} 
              />
              <input
                id="password-input"
                type="password"
                required
                placeholder="••••••••"
                value={passwordValue}
                onChange={(e) => setPasswordValue(e.target.value)}
                className={styles["inputText-field"]}
                style={{ paddingInlineStart: "44px" }}
              />
            </div>
          </div>

          {/* Submit Action */}
          <button 
            type="submit" 
            disabled={isSubmitting} 
            className={styles["submitButton-element"]}
          >
            {isSubmitting ? (
              <>
                <Loader2 size={18} className={styles["spinnerIcon-element"]} />
                <span>Processing...</span>
              </>
            ) : (
              <span>{isSignUpMode ? "Create Account" : "Sign In"}</span>
            )}
          </button>
        </form>

        {/* SSO Integration */}
        <div className={styles['divider-line-element']}>
          <span>or continue with</span>
        </div>

        <button 
          type="button" 
          onClick={handleGoogleSignIn} 
          className={styles["googleSignIn-button"]}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
          </svg>
          Google SSO
        </button>

        {/* Mode Toggle */}
        <p className={styles["modeSwitching-paragraph"]}>
          {isSignUpMode ? "Already have an account?" : "Don't have an account yet?"}
          <button 
            type="button" 
            onClick={() => {
              setIsSignUpMode(!isSignUpMode);
              setAlertError("");
              setAlertSuccess("");
            }}
            className={styles["toggleMode-button"]}
          >
            {isSignUpMode ? "Sign In" : "Sign Up"}
          </button>
        </p>
      </section>
    </main>
  );
}

export default function LogInPage() {
  return (
    <Suspense fallback={
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        backgroundColor: "oklch(0.08 0.01 250)",
      }}>
        <PanelLoadingSpinner size="large" />
      </div>
    }>
      <LogInContentComponent />
    </Suspense>
  );
}
