import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return supabaseResponse;
    }

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    // If user is logged in, check if is_banned
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_banned, role')
        .eq('id', user.id)
        .maybeSingle();

      if (profile?.is_banned) {
        // If user is banned and not on /banned page, redirect or sign out
        if (!request.nextUrl.pathname.startsWith('/banned')) {
          const url = request.nextUrl.clone();
          url.pathname = '/banned';
          return NextResponse.redirect(url);
        }
      }

      // Protect /admin routes: only allow role === 'admin'
      if (request.nextUrl.pathname.startsWith('/admin')) {
        if (profile?.role !== 'admin') {
          const url = request.nextUrl.clone();
          url.pathname = '/';
          return NextResponse.redirect(url);
        }
      }
    } else {
      // Protect /admin routes at middleware level.
      // Other routes (/profile/edit, /warehouse/new, /incidents/new) perform reliable client-side auth checks
      // preventing 307 redirect loops on mobile browsers and PWAs.
      if (request.nextUrl.pathname.startsWith('/admin')) {
        const url = request.nextUrl.clone();
        url.pathname = '/login';
        url.searchParams.set('redirectTo', request.nextUrl.pathname);
        return NextResponse.redirect(url);
      }
    }
  } catch (err) {
    console.warn('Middleware updateSession non-blocking error:', err);
  }

  return supabaseResponse;
}
