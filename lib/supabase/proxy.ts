import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasEnvVars } from "../utils";
import { createSupabaseAdmin } from "./admin";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  // If the env vars are not set, skip proxy check. You can remove this
  // once you setup the project.
  if (!hasEnvVars) {
    return supabaseResponse;
  }

  // With Fluid compute, don't put this client in a global environment
  // variable. Always create a new one on each request.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and
  // supabase.auth.getClaims(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // IMPORTANT: If you remove getClaims() and you use server-side rendering
  // with the Supabase client, your users may be randomly logged out.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  if (
    request.nextUrl.pathname !== "/" &&
    !user &&
    !request.nextUrl.pathname.startsWith("/login") &&
    !request.nextUrl.pathname.startsWith("/sign-in") &&
    !request.nextUrl.pathname.startsWith("/sign-up") &&
    !request.nextUrl.pathname.startsWith("/auth")
  ) {
    // no user, potentially respond by redirecting the user to the login page
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    return NextResponse.redirect(url);
  }

  // Check if user is trying to access /admin routes
  if (request.nextUrl.pathname.startsWith("/admin")) {
    try {
      // Get user ID from claims (JWT standard uses 'sub' for subject/user ID)
      // Also try to get user directly if claims don't have sub
      let userId: string | undefined = user?.sub || user?.id;
      
      // If we don't have userId from claims, try getUser()
      if (!userId) {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        userId = authUser?.id;
      }
      
      // Hardcoded super-admin fallback
      const SUPER_ADMIN_ID = "781c7402-f347-42ac-a4ad-942b78848278";
      
      if (!userId) {
        // No user ID, redirect to sign-in
        const url = request.nextUrl.clone();
        url.pathname = "/sign-in";
        return NextResponse.redirect(url);
      }

      // Allow access if user is hardcoded super-admin
      if (userId === SUPER_ADMIN_ID) {
        return supabaseResponse;
      }

      // Use admin client to check profile (bypasses RLS)
      const admin = createSupabaseAdmin();
      
      // Check profile for global_role
      const { data: profile, error: profileError } = await admin
        .from("profiles")
        .select("global_role")
        .eq("id", userId)
        .single();

      // Check if user has super_admin role
      const isSuperAdmin = !profileError && profile && profile.global_role === "super_admin";

      if (!isSuperAdmin) {
        // Not a super_admin, redirect to projects
        const url = request.nextUrl.clone();
        url.pathname = "/projects";
        return NextResponse.redirect(url);
      }
    } catch (error) {
      // Error checking role, redirect to projects for safety
      console.error("Proxy admin check error:", error);
      const url = request.nextUrl.clone();
      url.pathname = "/projects";
      return NextResponse.redirect(url);
    }
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  // If you're creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse;
}
