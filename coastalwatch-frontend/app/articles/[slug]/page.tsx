'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import SidebarLayout from '@/components/layout/SidebarLayout'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { fetchArticle, fetchArticles } from '@/lib/mangrove-api'
import { useAuth } from '@/lib/auth-context'
import type { Article } from '@/lib/types'
import { formatDate } from '@/lib/utils'
import {
  ArrowLeft, Eye, Calendar, User, Clock, Pencil,
  Share2, CheckCircle, AlertCircle, ChevronRight,
} from 'lucide-react'
import toast from 'react-hot-toast'

const CATEGORY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  tips:     { label: 'Tips & Practices', color: 'text-green-700',  bg: 'bg-green-100'  },
  news:     { label: 'News',             color: 'text-blue-700',   bg: 'bg-blue-100'   },
  guide:    { label: 'Guide',            color: 'text-amber-700',  bg: 'bg-amber-100'  },
  research: { label: 'Research',         color: 'text-purple-700', bg: 'bg-purple-100' },
}

const MANAGER_ROLES = ['admin', 'staff', 'menro']

/** Estimate reading time from word count */
function readingTime(content: string): number {
  const words = content.trim().split(/\s+/).length
  return Math.max(1, Math.ceil(words / 200)) // 200 wpm average
}

export default function ArticleDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const router   = useRouter()
  const { user } = useAuth()

  const [article, setArticle]         = useState<Article | null>(null)
  const [related, setRelated]         = useState<Article[]>([])
  const [loading, setLoading]         = useState(true)
  const [copied, setCopied]           = useState(false)

  const isManager = MANAGER_ROLES.includes(user?.role ?? '')
  const backHref  = isManager ? '/articles/manage' : '/articles'
  const backLabel = isManager ? 'Back to Manage Articles' : 'Back to Articles'

  useEffect(() => {
    fetchArticle(slug)
      .then(a => {
        setArticle(a)
        // Load related articles (same category, exclude current) — public endpoint
        fetchArticles({ category: a.category, per_page: 10 })
          .then(res => {
            const all: Article[] = Array.isArray(res) ? res : (res?.data ?? [])
            const others = all
              .filter((x: Article) => x.is_published && x.slug !== slug)
              .slice(0, 3)
            setRelated(others)
          })
          .catch(() => {})
      })
      .catch(() => router.push(backHref))
      .finally(() => setLoading(false))
  }, [slug]) // eslint-disable-line

  const handleShare = async () => {
    const url = window.location.href
    try {
      if (navigator.share) {
        await navigator.share({ title: article?.title, url })
      } else {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        toast.success('Link copied to clipboard')
        setTimeout(() => setCopied(false), 2500)
      }
    } catch {}
  }

  if (loading) return (
    <SidebarLayout>
      <div className="page-container"><LoadingSpinner /></div>
    </SidebarLayout>
  )
  if (!article) return null

  const cat     = CATEGORY_CONFIG[article.category] ?? { label: article.category, color: 'text-gray-600', bg: 'bg-gray-100' }
  const minRead = readingTime(article.content)
  const updatedAt = (article as any).updated_at
  const wasUpdated = updatedAt && updatedAt !== article.created_at

  return (
    <SidebarLayout title={article.title} subtitle="Articles & Tips">
      <div className="page-container max-w-3xl mx-auto space-y-6">

        {/* ── Single back link (top only) ────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 font-medium transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 transition-transform duration-150 group-hover:-translate-x-0.5" />
            {backLabel}
          </Link>

          {/* Admin: Edit button + status badge */}
          {isManager && (
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full ${
                article.is_published ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'
              }`}>
                {article.is_published
                  ? <><CheckCircle className="w-3 h-3" /> Published</>
                  : <><AlertCircle className="w-3 h-3" /> Draft</>
                }
              </span>
              <Link
                href="/articles/manage"
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-primary-50 text-primary-700 hover:bg-primary-100 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" /> Edit
              </Link>
            </div>
          )}
        </div>

        {/* ── Cover image with proper alt text ─────────────────────────────── */}
        {article.cover_image_url && (
          <div className="relative h-64 rounded-2xl overflow-hidden shadow-md">
            <img
              src={article.cover_image_url}
              alt={`Cover image for article: ${article.title}`}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
          </div>
        )}

        {/* ── Article header ────────────────────────────────────────────────── */}
        <div className="space-y-3">
          {/* Category badge */}
          <span className={`inline-block text-xs font-bold uppercase tracking-wide px-3 py-1 rounded-full ${cat.color} ${cat.bg}`}>
            {cat.label}
          </span>

          {/* Title */}
          <h1 className="text-2xl font-extrabold text-gray-900 leading-tight">{article.title}</h1>

          {/* Meta row — darkened text for readability */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-600">
            <span className="flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-gray-400" />
              {article.author?.name ?? 'MENRO Gloria'}
            </span>
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-gray-400" />
              {formatDate(article.published_at ?? article.created_at)}
            </span>
            {wasUpdated && (
              <span className="flex items-center gap-1 text-gray-400 italic">
                · Updated {formatDate(updatedAt)}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-gray-400" />
              {minRead} min read
            </span>
            <span className="flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-gray-400" />
              {article.views} view{article.views !== 1 ? 's' : ''}
            </span>

            {/* Share / copy link */}
            <button
              onClick={handleShare}
              className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 hover:text-gray-800 transition-colors"
              title="Share or copy link"
            >
              {copied ? <CheckCircle className="w-3.5 h-3.5 text-green-500" /> : <Share2 className="w-3.5 h-3.5" />}
              {copied ? 'Copied!' : 'Share'}
            </button>
          </div>

          {/* Excerpt / summary */}
          {article.excerpt && (
            <p className="text-base text-gray-700 leading-relaxed border-l-4 border-primary-300 pl-4 italic">
              {article.excerpt}
            </p>
          )}
        </div>

        {/* ── Article body ─────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
          {article.content.split('\n').map((para, i) =>
            para.trim()
              ? <p key={i} className="text-sm text-gray-800 leading-relaxed mb-4">{para}</p>
              : <br key={i} />
          )}
        </div>

        {/* ── Related articles ──────────────────────────────────────────────── */}
        {related.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">
              More in {cat.label}
            </p>
            <div className="space-y-2">
              {related.map(r => (
                <Link
                  key={r.id}
                  href={`/articles/${r.slug}`}
                  className="flex items-center gap-3 p-3 rounded-xl bg-white border border-gray-100 hover:border-primary-200 hover:bg-primary-50/30 transition-all group"
                >
                  {r.cover_image_url && (
                    <img
                      src={r.cover_image_url}
                      alt={r.title}
                      className="w-14 h-10 rounded-lg object-cover shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-primary-700 transition-colors">
                      {r.title}
                    </p>
                    {r.excerpt && (
                      <p className="text-xs text-gray-500 truncate mt-0.5">{r.excerpt}</p>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-primary-500 shrink-0 transition-colors" />
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ── All articles link (single, at the bottom only) ────────────────── */}
        <div className="pt-2 border-t border-gray-100">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 font-medium transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 transition-transform duration-150 group-hover:-translate-x-0.5" />
            {backLabel}
          </Link>
        </div>

      </div>
    </SidebarLayout>
  )
}
