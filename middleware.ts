import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { checkStrIsNotionId, getLastPartOfUrl } from '@/lib/utils'
import { idToUuid } from 'notion-utils'
import BLOG from './blog.config'

/**
 * 🚫 屏蔽中国大陆 IP
 */
function blockChina(req: NextRequest) {
  const country = req.headers.get('x-vercel-ip-country') || 'unknown'
  if (country === 'CN') {
    return new NextResponse('Access Denied', { status: 403 })
    // 或者：
    // return NextResponse.redirect(new URL('/blocked', req.url))
  }
  return null
}

/**
 * Clerk 身份验证中间件
 */
export const config = {
  matcher: ['/((?!.*\\..*|_next|/sign-in|/auth).*)', '/', '/(api|trpc)(.*)']
}

// 限制登录访问的路由
const isTenantRoute = createRouteMatcher([
  '/user/organization-selector(.*)',
  '/user/orgid/(.*)',
  '/dashboard',
  '/dashboard/(.*)'
])

// 限制权限访问的路由
const isTenantAdminRoute = createRouteMatcher([
  '/admin/(.*)/memberships',
  '/admin/(.*)/domain'
])

/**
 * 默认中间件（整合 blockChina + Clerk）
 */
export default function middleware(req: NextRequest) {
  // 先检查中国大陆访问
  const blocked = blockChina(req)
  if (blocked) return blocked

  // 再执行 Clerk 的默认逻辑
  return clerkMiddleware()(req)
}
