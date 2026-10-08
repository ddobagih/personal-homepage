import { cloneElement, isValidElement, useMemo, type MouseEvent, type PropsWithChildren, type ReactElement } from "react";
import { useAuth } from "./workspace";
import { useRouter } from "./navigation";

export { useAuth } from "./workspace";
export function useUser() {
  const auth = useAuth();
  const user = useMemo(() => auth.authenticated ? {
    id: "admin", firstName: "관리자", fullName: "관리자", imageUrl: "",
    emailAddresses: [{ emailAddress: auth.email || "관리자 계정" }],
  } : null, [auth.authenticated, auth.email]);
  return { user, isLoaded: !auth.loading, isSignedIn: auth.authenticated };
}
export function useClerk() {
  const { logout } = useAuth();
  const router = useRouter();
  return useMemo(() => ({
    signOut: logout,
    openUserProfile: () => router.push("/settings"),
  }), [router, logout]);
}
export function SignOutButton({ children }: PropsWithChildren) {
  const { logout } = useAuth();
  if (!isValidElement(children)) return null;
  const child = children as ReactElement<{ onClick?: (event: MouseEvent) => void }>;
  return cloneElement(child, { onClick: async event => {
    child.props.onClick?.(event);
    if (event.defaultPrevented) return;
    try { await logout(); }
    catch (error) { window.alert(error instanceof Error ? error.message : "로그아웃하지 못했습니다."); }
  } });
}
export function ClerkProvider({ children }: PropsWithChildren) { return children; }
