"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Eye, EyeOff, Lock, LogOut } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiSend } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";

type AuthMe = {
  user: { id: string; email: string; name: string } | null;
  workspace: { id: string; name: string; ownerId: string } | null;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "");
  return letters.join("") || "?";
}

function PasswordField({
  id,
  label,
  autoComplete,
  value,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  autoComplete: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required
          minLength={id === "newPassword" ? 8 : undefined}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="pr-12"
        />
        <button
          type="button"
          onClick={() => setVisible((open) => !open)}
          className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center text-stone-400 hover:text-stone-700"
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {hint ? <p className="text-xs text-stone-400">{hint}</p> : null}
    </div>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["auth-me"],
    queryFn: () => apiGet<AuthMe>("/api/auth/me"),
  });

  const [name, setName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (data?.user) setName(data.user.name);
    if (data?.workspace) setWorkspaceName(data.workspace.name);
  }, [data]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="h-8 w-40 animate-pulse rounded-md bg-stone-200/80" />
        <div className="h-36 animate-pulse rounded-2xl bg-white/80" />
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="h-72 animate-pulse rounded-xl bg-white/80 lg:col-span-3" />
          <div className="h-72 animate-pulse rounded-xl bg-white/80 lg:col-span-2" />
        </div>
      </div>
    );
  }

  if (!data?.user || !data.workspace) {
    return <p className="text-stone-500">Sign in to manage your profile.</p>;
  }

  const profileDirty =
    name.trim() !== data.user.name || workspaceName.trim() !== data.workspace.name;

  async function onSaveProfile(event: React.FormEvent) {
    event.preventDefault();
    setSavingProfile(true);
    try {
      await apiSend("/api/auth/profile", {
        method: "PATCH",
        body: JSON.stringify({ name, workspaceName }),
      });
      await queryClient.invalidateQueries({ queryKey: ["auth-me"] });
      toast.success("Profile updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update profile");
    } finally {
      setSavingProfile(false);
    }
  }

  async function onChangePassword(event: React.FormEvent) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match.");
      return;
    }
    setSavingPassword(true);
    try {
      await apiSend("/api/auth/password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      toast.success("Password changed. Sign in again.");
      router.replace("/login");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not change password");
    } finally {
      setSavingPassword(false);
    }
  }

  async function onLogout() {
    setLoggingOut(true);
    try {
      await apiSend("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not sign out");
      setLoggingOut(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 sm:space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-teal-800 sm:text-sm">
          Account
        </p>
        <h1 className="page-title mt-1 text-stone-900">Profile</h1>
        <p className="mt-2 text-sm text-stone-600 sm:text-base">
          How you appear in PayChase, and how you sign in.
        </p>
      </div>

      <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
        <div className="relative bg-gradient-to-br from-teal-800 via-teal-800 to-teal-950 px-5 py-5 sm:px-6 sm:py-6">
          <div className="pointer-events-none absolute inset-0 opacity-15 [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:18px_18px]" />
          <div className="relative flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 font-[family-name:var(--font-display)] text-xl text-white ring-1 ring-white/25 sm:h-16 sm:w-16 sm:text-2xl">
              {initials(data.user.name)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <h2 className="truncate font-[family-name:var(--font-display)] text-xl text-white sm:text-2xl">
                  {data.user.name}
                </h2>
                <button
                  type="button"
                  onClick={onLogout}
                  disabled={loggingOut}
                  className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-teal-50/80 hover:bg-white/10 hover:text-white disabled:opacity-50"
                >
                  <LogOut className="h-4 w-4" />
                  {loggingOut ? "Signing out…" : "Sign out"}
                </button>
              </div>
              <p className="mt-0.5 truncate text-sm text-teal-50/75">{data.user.email}</p>
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/12 px-2.5 py-1 text-xs font-medium text-white ring-1 ring-white/15">
                <Building2 className="h-3.5 w-3.5" />
                {data.workspace.name}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-5 lg:gap-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Details</CardTitle>
            <CardDescription>
              Your name and the workspace invoices belong to.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSaveProfile} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="workspaceName">Workspace</Label>
                <Input
                  id="workspaceName"
                  required
                  value={workspaceName}
                  onChange={(event) => setWorkspaceName(event.target.value)}
                />
                <p className="text-xs text-stone-400">
                  One person, one workspace in V1.
                </p>
              </div>
              <div className="flex items-center justify-between gap-3 pt-1">
                <p className="text-xs text-stone-400">
                  {profileDirty ? "Unsaved changes" : "All changes saved"}
                </p>
                <Button type="submit" disabled={savingProfile || !profileDirty}>
                  {savingProfile ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-teal-800" />
              <CardTitle>Password</CardTitle>
            </div>
            <CardDescription>
              Changing it signs you out everywhere.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onChangePassword} className="space-y-4">
              <PasswordField
                id="currentPassword"
                label="Current password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={setCurrentPassword}
              />
              <PasswordField
                id="newPassword"
                label="New password"
                autoComplete="new-password"
                value={newPassword}
                onChange={setNewPassword}
                hint="At least 8 characters."
              />
              <PasswordField
                id="confirmPassword"
                label="Confirm new password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={setConfirmPassword}
              />
              <Button
                type="submit"
                variant="secondary"
                className="w-full"
                disabled={savingPassword}
              >
                {savingPassword ? "Updating…" : "Update password"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
