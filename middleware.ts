import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { checkStrIsNotionId, getLastPartOfUrl } from '@/lib/utils'
import { idToUuid } from 'notion-utils'
import BLOG from './blog.config'
import blocks from './GeoLite2-Country-Blocks.json' // 根目录 JSON

/**
 * IP 工具：IPv4 转数字
 */
function ipToNumber(ip: string) {
  return ip
    .split('.')
    .reduce((acc, octet) => (acc << 8) + Number(octet), 0)
}

/**
 * 判断是否中国大陆 IP
 */
function isChineseIP(ip: string) {
  const num = ipToNumber(ip)
  return blocks.some(block => num >= block.start && num <= block.end)
}

/**
 * 屏蔽中国大陆 IP
 */
function blockChina(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || '0.0.0.0'
  if (isChineseIP(ip)) {
    return new NextResponse('Access Denied', { status: 403 })
    // 或者跳转到自定义页面
    // return NextResponse.redirect(new URL('/blocked', req.url))
  }
  return null
}

/**
 * Next.js Middleware 配置
 * 白名单路径，避免拦截静态资源和部分 API
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
 * noAuthMiddleware：处理未配置 Clerk 的重定向逻辑
 */
const noAuthMiddleware = async (req: NextRequest) => {
  if (BLOG['UUID_REDIRECT']) {
    let redirectJson: Record<string, string> = {}
    try {
      const response = await fetch(`${req.nextUrl.origin}/redirect.json`)
      if (response.ok) redirectJson = await response.json()
    } catch (err) {
      console.error('Error fetching redirect.json:', err)
    }

    let lastPart = getLastPartOfUrl(req.nextUrl.pathname)
    if (checkStrIsNotionId(lastPart)) lastPart = idToUuid(lastPart)

    const target = redirectJson[lastPart]
    if (typeof target === 'string' && target.length > 0) {
      return NextResponse.redirect(new URL(target, req.url))
    }
  }

  return NextResponse.next()
}

/**
 * 默认中间件：先屏蔽大陆 IP，再执行 Clerk/NotionNext 的逻辑
 */
export default async function middleware(req: NextRequest, event: any) {
  // 1️⃣ 屏蔽中国大陆 IP
  const blocked = blockChina(req)
  if (blocked) return blocked

  // 2️⃣ 如果未配置 Clerk，则使用 noAuthMiddleware
  if (!process.env.CLERK_SECRET_KEY) return noAuthMiddleware(req)

  // 3️⃣ 否则走 Clerk 权限逻辑
  return clerkMiddleware()(req, event)
}
