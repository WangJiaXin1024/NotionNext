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
    // 返回 403 禁止访问
    return new NextResponse('Access Denied', { status: 403 })

    // 或者跳转到一个自定义页面（可选）
    // return NextResponse.redirect(new URL('/blocked', req.url))
  }
  return null
}

/**
 * Next.js Middleware 配置
 * 这里设置白名单，防止静态资源被拦截
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
 * 没有配置权限相关功能的返回
 */
const noAuthMiddleware = async (req: NextRequest) => {
  if (BLOG['UUID_REDIRECT']) {
    let redirectJson: Record<string, string> = {}
    try {
      const response = await fetch(`${req.nextUrl.origin}/redirect.json`)
      if (response.ok) {
        redirectJson = (await response.json()) as Record<string, string>
      }
    } catch (err) {
      console.error('Error fetching static file:', err)
    }
    let lastPart = getLastPartOfUrl(req.nextUrl.pathname) as string
    if (checkStrIsNotionId(lastPart)) {
      lastPart = idToUuid(lastPart)
    }
    if (redirectJson[lastPart]) {
      return NextResponse.redirect(new URL(redirectJson[lastPart], req.url))
    }
  }
  return NextResponse.next()
}

/**
 * 默认中间件：先屏蔽大陆，再执行 Clerk/NotionNext 的逻辑
 */
export default function middleware(req: NextRequest) {
  // 1. 检查是否来自中国大陆
  const blocked = blockChina(req)
  if (blocked) return blocked

  // 2. 如果没有配置 Clerk，则走 noAuthMiddleware
  if (!process.env.CLERK_SECRET_KEY) {
    return noAuthMiddleware(req)
  }

  // 3. 否则走 Clerk 的权限逻辑
  return clerkMiddleware()(req)
}
