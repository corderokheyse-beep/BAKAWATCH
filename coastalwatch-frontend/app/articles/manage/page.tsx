'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import SidebarLayout from '@/components/layout/SidebarLayout'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useAuth } from '@/lib/auth-context'
import { fetchAdminArticles, deleteArticle, createArticle, updateArticle } from '@/lib/mangrove-api'
import type { Article, ArticleCategory } from '@/lib/types'
import { formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import {
  Plus, Pencil, Trash2, Eye, EyeOff, BookOpen,
  Loader2, X, CheckCircle2, Search, ExternalLink,
  AlertTriangle, Image as ImageIcon,
} from 'lucide-react'
import toast from 'react-hot-toast'

const CATEGORIES: { value: ArticleCategory; label: string; color: string; bg: string }[] = [
  { value: 'tips',     label: 'Tips',     color: 'text-green-700',  bg: 'bg-green-100' },
  { value: 'news',     label: 'News',     color: 'text-blue-700',   bg: 'bg-blue-100' },
  { value: 'guide',    label: 'Guide',    color: 'text-amber-700',  bg: 'bg-amber-100' },
  { value: 'research', label: 'Research', color: 'text-purple-700', bg: 'bg-purple-100' },
]

interface FormState {
  title: string
  excerpt: string
  content: string
  category: ArticleCategory
  is_published: boolean
  cover_image?: File | null
}

const emptyForm = (): FormState => ({
  title: '', excerpt: '', content: '', category: 'tips', is_published: false, cover_image: null,
})

// ── Confirm-delete dialog ─────────────────────────────────────────────────────
function DeleteDialog({
  article, onConfirm, onCancel,
}: { article: Article; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm animate-scale-in">
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="font-bold text-gray-900">Delete article?</p>
              <p className="text-xs text-gray-500 mt-0.5">This cannot be undone.</p>
            </div>
          </div>
          <div className="bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
            <p className="text-sm font-semibold text-gray-800 line-clamp-2">"{article.title}"</p>
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={onCancel} className="btn-secondary flex-1">Cancel</button>
            <button onClick={onConfirm} className="flex-1 py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors">
              Yes, delete
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ManageArticlesPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  const [articles, setArticles]       = useState<Article[]>([])
  const [loading, setLoading]         = useState(true)
  const [showForm, setShowForm]       = useState(false)
  const [editing, setEditing]         = useState<Article | null>(null)
  const [form, setForm]               = useState<FormState>(emptyForm())
  const [saving, setSaving]           = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Article | null>(null)

  // Filters
  const [search, setSearch]           = useState('')
  const [catFilter, setCatFilter]     = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sortKey, setSortKey]         = useState<'date' | 'views' | 'title'>('date')

  // Form errors
  const [formErrors, setFormErrors]   = useState<Record<string, string>>({})

  useEffect(() => {
    if (authLoading) return
    if (!user || !['admin', 'staff', 'menro'].includes(user.role)) {
      router.replace('/login'); return
    }
    load()
  }, [authLoading, user]) // eslint-disable-line

  const load = () => {
    setLoading(true)
    fetchAdminArticles()
      .then(setArticles)
      .catch(() => toast.error('Failed to load articles'))
      .finally(() => setLoading(false))
  }

  // Filtered + sorted list
  const filtered = useMemo(() => {
    let list = articles.filter(a => {
      if (catFilter    && a.category !== catFilter)                        return false
      if (statusFilter === 'published' && !a.is_published)                return false
      if (statusFilter === 'draft'     &&  a.is_published)                return false
      if (search) {
        const q = search.toLowerCase()
        if (!a.title.toLowerCase().includes(q) && !(a.excerpt ?? '').toLowerCase().includes(q)) return false
      }
      return true
    })
    if (sortKey === 'views') list = [...list].sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
    else if (sortKey === 'title') list = [...list].sort((a, b) => a.title.localeCompare(b.title))
    else list = [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    return list
  }, [articles, search, catFilter, statusFilter, sortKey])

  const openNew  = () => { setEditing(null); setForm(emptyForm()); setFormErrors({}); setShowForm(true) }
  const openEdit = (a: Article) => {
    setEditing(a)
    setForm({ title: a.title, excerpt: a.excerpt ?? '', content: a.content, category: a.category, is_published: a.is_published, cover_image: null })
    setFormErrors({})
    setShowForm(true)
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteArticle(deleteTarget.id)
      toast.success('Article deleted')
      setDeleteTarget(null)
      load()
    } catch {
      toast.error('Delete failed')
      setDeleteTarget(null)
    }
  }

  // Validation with min-length checks
  const validate = (): boolean => {
    const errs: Record<string, string> = {}
    if (!form.title.trim())                    errs.title   = 'Title is required.'
    else if (form.title.trim().length < 8)     errs.title   = 'Title must be at least 8 characters.'
    if (!form.excerpt.trim())                  errs.excerpt = 'Summary is required — helps readers decide whether to read.'
    else if (form.excerpt.trim().length < 20)  errs.excerpt = 'Summary should be at least 20 characters.'
    if (!form.content.trim())                  errs.content = 'Content is required.'
    else if (form.content.trim().length < 50)  errs.content = 'Content should be at least 50 characters.'
    setFormErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSave = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      const fd = new FormData()
      fd.append('title',        form.title.trim())
      fd.append('excerpt',      form.excerpt.trim())
      fd.append('content',      form.content.trim())
      fd.append('category',     form.category)
      fd.append('is_published', form.is_published ? '1' : '0')
      if (form.cover_image) fd.append('cover_image', form.cover_image)
      if (editing) {
        fd.append('_method', 'PUT')
        await updateArticle(editing.id, fd)
        toast.success('Article updated!')
      } else {
        await createArticle(fd)
        toast.success('Article created!')
      }
      setShowForm(false)
      load()
    } catch (err: any) {
      // Surface specific field errors from the backend validation response
      const data = err?.response?.data
      if (data?.errors) {
        const firstError = Object.values(data.errors).flat()[0] as string
        toast.error(firstError ?? data.message ?? 'Save failed')
      } else {
        toast.error(data?.message ?? 'Save failed')
      }
    } finally {
      setSaving(false)
    }
  }

  if (authLoading || loading) return (
    <SidebarLayout title="Articles" subtitle="Create and publish articles, tips, and guides">
      <div className="page-container"><LoadingSpinner /></div>
    </SidebarLayout>
  )

  const hasFilters = !!(search || catFilter || statusFilter)

  return (
    <SidebarLayout title="Articles" subtitle="Create and publish articles, tips, and guides">
      <div className="page-container space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 animate-slide-up">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Articles</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {articles.length} article{articles.length !== 1 ? 's' : ''} total
              {' · '}{articles.filter(a => a.is_published).length} published
              {' · '}{articles.filter(a => !a.is_published).length} drafts
            </p>
          </div>
          <button onClick={openNew} className="btn-primary gap-1.5 shrink-0">
            <Plus className="w-4 h-4" /> New Article
          </button>
        </div>

        {/* Search + filters + sort */}
        {articles.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                className="input pl-10 pr-9"
                placeholder="Search articles…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Category filter */}
            <select className="input py-2 text-xs min-w-[130px]" value={catFilter} onChange={e => setCatFilter(e.target.value)}>
              <option value="">All categories</option>
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>

            {/* Status filter */}
            <select className="input py-2 text-xs min-w-[120px]" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
            </select>

            {/* Sort */}
            <select className="input py-2 text-xs min-w-[130px]" value={sortKey} onChange={e => setSortKey(e.target.value as 'date' | 'views' | 'title')}>
              <option value="date">Sort: Latest</option>
              <option value="views">Sort: Most viewed</option>
              <option value="title">Sort: Title A–Z</option>
            </select>

            {hasFilters && (
              <button
                onClick={() => { setSearch(''); setCatFilter(''); setStatusFilter('') }}
                className="text-xs text-primary-600 hover:text-primary-700 font-semibold flex items-center gap-1"
              >
                <X className="w-3.5 h-3.5" /> Clear
              </button>
            )}
            <p className="text-xs text-gray-400 ml-auto">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</p>
          </div>
        )}

        {/* Article list */}
        {articles.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-gray-100">
            <div className="w-16 h-16 rounded-3xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <BookOpen className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-base font-semibold text-gray-700 mb-1">No articles yet</p>
            <p className="text-sm text-gray-400 mb-5">Write your first article to share knowledge with the community.</p>
            <button onClick={openNew} className="btn-primary text-sm">
              <Plus className="w-4 h-4" /> Write First Article
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
            <Search className="w-8 h-8 text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-semibold text-gray-600">No articles match your filters</p>
            <button onClick={() => { setSearch(''); setCatFilter(''); setStatusFilter('') }} className="btn-secondary text-xs mt-4 px-4 py-2">
              Clear filters
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(a => {
              const cat = CATEGORIES.find(c => c.value === a.category)
              return (
                <div key={a.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 flex items-start gap-4 p-4">
                  {/* Thumbnail */}
                  {a.cover_image_url ? (
                    <img src={a.cover_image_url} alt={a.title} className="w-24 h-20 rounded-xl object-cover shrink-0" />
                  ) : (
                    <div className="w-24 h-20 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                      <ImageIcon className="w-6 h-6 text-gray-300" />
                    </div>
                  )}

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      {cat && (
                        <span className={cn('text-[10px] font-bold uppercase px-2 py-0.5 rounded-full', cat.color, cat.bg)}>
                          {cat.label}
                        </span>
                      )}
                      <span className={cn(
                        'text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1',
                        a.is_published ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'
                      )}>
                        {a.is_published ? <><Eye className="w-3 h-3" /> Published</> : <><EyeOff className="w-3 h-3" /> Draft</>}
                      </span>
                    </div>
                    <p className="font-semibold text-gray-900 text-sm leading-snug mb-1">{a.title}</p>
                    {a.excerpt && (
                      <p className="text-xs text-gray-600 line-clamp-2 mb-1.5">{a.excerpt}</p>
                    )}
                    <p className="text-xs text-gray-400">
                      By {a.author?.name ?? 'MENRO Admin'} · {formatDate(a.created_at)} · {a.views ?? 0} views
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {a.is_published && (
                      <Link
                        href={`/articles/${a.slug}`}
                        className="p-2 rounded-xl hover:bg-gray-50 text-gray-400 hover:text-gray-600 transition-colors"
                        title="Preview article"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Link>
                    )}
                    <button
                      onClick={() => openEdit(a)}
                      className="p-2 rounded-xl hover:bg-primary-50 text-primary-600 transition-colors"
                      title="Edit article"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(a)}
                      className="p-2 rounded-xl hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors"
                      title="Delete article"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Confirm Delete Dialog ────────────────────────────────────────────── */}
      {deleteTarget && (
        <DeleteDialog
          article={deleteTarget}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* ── Article Form Modal ───────────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm overflow-y-auto py-8 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
              <h2 className="font-bold text-gray-900">{editing ? 'Edit Article' : 'New Article'}</h2>
              <button onClick={() => setShowForm(false)} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-5">

              {/* Title */}
              <div>
                <label className="label">Title *</label>
                <input
                  className={cn('input', formErrors.title && 'border-red-400')}
                  placeholder="e.g. How to plant Rhizophora mucronata seedlings"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                />
                {formErrors.title
                  ? <p className="text-xs text-red-500 mt-1">{formErrors.title}</p>
                  : <p className="text-xs text-gray-400 mt-1">Minimum 8 characters. Be specific and descriptive.</p>
                }
              </div>

              {/* Summary / Excerpt */}
              <div>
                <label className="label">Summary *</label>
                <textarea
                  className={cn('input resize-none', formErrors.excerpt && 'border-red-400')}
                  rows={2}
                  placeholder="One or two sentences that tell readers what this article is about…"
                  value={form.excerpt}
                  onChange={e => setForm(f => ({ ...f, excerpt: e.target.value }))}
                />
                {formErrors.excerpt
                  ? <p className="text-xs text-red-500 mt-1">{formErrors.excerpt}</p>
                  : <p className="text-xs text-gray-400 mt-1">Minimum 20 characters. Shown in the article list.</p>
                }
              </div>

              {/* Category + cover image */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Category *</label>
                  <select className="input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as ArticleCategory }))}>
                    {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Cover Image</label>
                  <input
                    type="file"
                    accept="image/*"
                    className="input text-xs"
                    onChange={e => setForm(f => ({ ...f, cover_image: e.target.files?.[0] ?? null }))}
                  />
                  <p className="text-xs text-gray-400 mt-1">JPG, PNG — max 5 MB</p>
                </div>
              </div>

              {/* Content */}
              <div>
                <label className="label">Content *</label>
                <textarea
                  className={cn('input font-mono text-xs resize-y', formErrors.content && 'border-red-400')}
                  rows={12}
                  placeholder="Write your article content here.&#10;&#10;Use blank lines to separate paragraphs.&#10;Use **bold** for emphasis."
                  value={form.content}
                  onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                />
                {formErrors.content
                  ? <p className="text-xs text-red-500 mt-1">{formErrors.content}</p>
                  : <p className="text-xs text-gray-400 mt-1">Minimum 50 characters. Use blank lines to separate paragraphs.</p>
                }
              </div>

              {/* Publish toggle */}
              <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl border border-gray-100 hover:bg-gray-50 transition-colors">
                <input
                  type="checkbox"
                  checked={form.is_published}
                  onChange={e => setForm(f => ({ ...f, is_published: e.target.checked }))}
                  className="w-4 h-4 accent-primary-600 rounded mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium text-gray-800">Publish immediately</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {form.is_published
                      ? 'Visible to all users right after saving.'
                      : 'Saved as draft — only admins can see it until published.'}
                  </p>
                </div>
              </label>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 sticky bottom-0 bg-white">
              <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary gap-1.5">
                {saving
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                  : <><CheckCircle2 className="w-4 h-4" /> {editing ? 'Update Article' : 'Create Article'}</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </SidebarLayout>
  )
}
