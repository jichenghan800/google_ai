import React, { useEffect, useMemo, useState } from 'react';
import { adminAPI } from '../services/api.ts';
import { AdminImageRecord, AdminImageSummary, AdminUserWithStats, UserTier, UserRole } from '../types';
import { ASPECT_RATIO_OPTIONS } from '../constants/aspectRatios.ts';
import { RESOLUTION_OPTIONS } from '../constants/resolutions.ts';
import { LoadingSpinner } from './LoadingSpinner.tsx';
import { ErrorMessage } from './ErrorMessage.tsx';
import { XMarkIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { templateAPI } from '../services/api.ts';

type Props = {
  onClose: () => void;
  isZh?: boolean;
  userAvatar?: string;
  onAvatarChange?: (val: string) => void;
};

const formatDate = (iso?: string) => {
  if (!iso) return '-';
  const d = new Date(iso);
  // Pad to yyyy-MM-dd HH:mm
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const AdminConsole: React.FC<Props> = ({ onClose, isZh }) => {
  const [summary, setSummary] = useState<AdminImageSummary | null>(null);
  const [items, setItems] = useState<AdminImageRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    userEmail: '',
    kind: '',
    resolution: '',
    aspectRatio: '',
    start: '',
    end: ''
  });
  const [tierUpdating, setTierUpdating] = useState<Record<string, boolean>>({});
  const [users, setUsers] = useState<AdminUserWithStats[]>([]);
  const [userTotal, setUserTotal] = useState(0);
  const [userLimit, setUserLimit] = useState(20);
  const [userOffset, setUserOffset] = useState(0);
  const [userLoading, setUserLoading] = useState(false);
  const [userError, setUserError] = useState<string | null>(null);
  const [userFilters, setUserFilters] = useState({ email: '' });
  const [userUpdating, setUserUpdating] = useState<Record<string, boolean>>({});
  const [templatesPro, setTemplatesPro] = useState<any[]>([]);
  const [tplLoading, setTplLoading] = useState(false);
  const [tplError, setTplError] = useState<string | null>(null);
  const [tplUploadState, setTplUploadState] = useState<Record<string, boolean>>({});
  const [tplDeleteState, setTplDeleteState] = useState<Record<string, boolean>>({});
  const [tplRatio, setTplRatio] = useState('1:1');
  const [tplResolution, setTplResolution] = useState('1K');
  const [tplPreview, setTplPreview] = useState<{ url: string; title: string } | null>(null);

  const kindOptions = [
    { id: '', label: isZh ? '全部' : 'All' },
    { id: 'generate', label: isZh ? '生成' : 'Generate' },
    { id: 'edit', label: isZh ? '编辑' : 'Edit' }
  ];

  const aspectOptions = useMemo(() => [{ id: '', label: isZh ? '全部' : 'All' }, ...ASPECT_RATIO_OPTIONS.map((r) => ({ id: r.id, label: isZh ? (r.labelZh || r.label) : (r.labelEn || r.label) }))], [isZh]);
  const resolutionOptions = useMemo(
    () => [{ id: '', label: isZh ? '全部' : 'All' }, ...RESOLUTION_OPTIONS.map((r) => ({ id: r.id, label: isZh ? (r.labelZh || r.label) : (r.labelEn || r.label) }))],
    [isZh]
  );

  const loadSummary = async () => {
    setSummaryLoading(true);
    try {
      const resp = await adminAPI.getSummary();
      setSummary(resp.data || null);
    } catch (e: any) {
      setError(e?.message || 'Failed to load summary');
    } finally {
      setSummaryLoading(false);
    }
  };

  const loadList = async (nextOffset = offset, nextLimit = limit) => {
    setLoading(true);
    setError(null);
    try {
      const resp = await adminAPI.getImageStats({
        ...filters,
        limit: nextLimit,
        offset: nextOffset
      });
      setItems(resp.data?.items || []);
      setTotal(resp.data?.total || 0);
      setLimit(resp.data?.limit || nextLimit);
      setOffset(resp.data?.offset ?? nextOffset);
    } catch (e: any) {
      setError(e?.message || 'Failed to load records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSummary();
    loadList(0, limit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadUsers(0, userLimit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadTemplatesPro = async () => {
    setTplLoading(true);
    setTplError(null);
    try {
      const resp = await templateAPI.getTemplates('edit-pro');
      setTemplatesPro(resp.data || []);
    } catch (e: any) {
      setTplError(e?.message || 'Failed to load templates');
    } finally {
      setTplLoading(false);
    }
  };

  useEffect(() => {
    loadTemplatesPro();
  }, []);

  const onApplyFilters = () => {
    loadList(0, limit);
  };

  const onPageChange = (direction: 'prev' | 'next') => {
    const nextOffset = direction === 'prev' ? Math.max(0, offset - limit) : offset + limit;
    if (nextOffset < 0) return;
    if (direction === 'next' && nextOffset >= total) return;
    loadList(nextOffset, limit);
  };

  const updateTier = async (userId?: string | null, nextTier?: string) => {
    if (!userId || !nextTier) return;
    setTierUpdating((m) => ({ ...m, [userId]: true }));
    try {
      await adminAPI.updateUserTier(userId, nextTier);
      await loadList(offset, limit);
    } catch (e: any) {
      setError(e?.message || 'Failed to update tier');
    } finally {
      setTierUpdating((m) => {
        const clone = { ...m };
        delete clone[userId];
        return clone;
      });
    }
  };

  const loadUsers = async (nextOffset = userOffset, nextLimit = userLimit) => {
    setUserLoading(true);
    setUserError(null);
    try {
      const resp = await adminAPI.getUsers({
        email: userFilters.email,
        limit: nextLimit,
        offset: nextOffset
      });
      const data = resp.data || {};
      setUsers(data.items || []);
      setUserTotal(data.total || 0);
      setUserLimit(data.limit || nextLimit);
      setUserOffset(data.offset ?? nextOffset);
    } catch (e: any) {
      setUserError(e?.message || 'Failed to load users');
    } finally {
      setUserLoading(false);
    }
  };

  const onUserPageChange = (direction: 'prev' | 'next') => {
    const nextOffset = direction === 'prev' ? Math.max(0, userOffset - userLimit) : userOffset + userLimit;
    if (nextOffset < 0) return;
    if (direction === 'next' && nextOffset >= userTotal) return;
    loadUsers(nextOffset, userLimit);
  };

  const handleUserAccessChange = async (userId: string, role?: UserRole, tier?: UserTier) => {
    setUserUpdating((m) => ({ ...m, [userId]: true }));
    try {
      await adminAPI.updateUserAccess(userId, { role, tier });
      await loadUsers(userOffset, userLimit);
    } catch (e: any) {
      setUserError(e?.message || 'Failed to update user');
    } finally {
      setUserUpdating((m) => {
        const clone = { ...m };
        delete clone[userId];
        return clone;
      });
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center px-4">
      <div className="w-full max-w-6xl max-h-[90vh] overflow-hidden rounded-2xl border border-[var(--border-soft,#334155)] bg-[var(--surface-0,#0f172a)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border-soft,#334155)] px-4 py-3">
          <div>
            <div className="text-lg font-semibold text-[var(--text-primary,#e2e8f0)]">{isZh ? '管理控制台' : 'Admin Console'}</div>
            <div className="text-xs text-[var(--text-secondary,#94a3b8)]">
              {isZh ? '统计与权限管理' : 'Analytics & access control'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="icon-button"
              onClick={() => {
                loadSummary();
                loadList(0, limit);
              }}
              title={isZh ? '刷新' : 'Refresh'}
            >
              <ArrowPathIcon className="h-5 w-5" />
            </button>
            <button type="button" className="icon-button" onClick={onClose} aria-label="Close admin console">
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="p-4 overflow-y-auto space-y-4 max-h-[80vh]">
          <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {summaryLoading ? (
              <div className="col-span-3 flex justify-center py-4">
                <LoadingSpinner message={isZh ? '加载统计...' : 'Loading summary...'} />
              </div>
            ) : (
              <>
                <div className="p-3 rounded-xl bg-[var(--surface-1,#111827)] border border-[var(--border-soft,#334155)]">
                  <div className="text-xs text-[var(--text-secondary,#94a3b8)]">{isZh ? '按类型' : 'By kind'}</div>
                  <div className="mt-2 space-y-1">
                    {(summary?.byKind || []).map((row) => (
                      <div key={row.kind || 'unknown'} className="flex justify-between text-sm text-[var(--text-primary,#e2e8f0)]">
                        <span>{row.kind || 'unknown'}</span>
                        <span>{row.count}</span>
                      </div>
                    ))}
                    {!summary?.byKind?.length && <div className="text-sm text-[var(--text-secondary)]">{isZh ? '无数据' : 'No data'}</div>}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-[var(--surface-1,#111827)] border border-[var(--border-soft,#334155)]">
                  <div className="text-xs text-[var(--text-secondary,#94a3b8)]">{isZh ? '按分辨率' : 'By resolution'}</div>
                  <div className="mt-2 space-y-1">
                    {(summary?.byResolution || []).map((row) => (
                      <div key={row.resolution || 'unknown'} className="flex justify-between text-sm text-[var(--text-primary,#e2e8f0)]">
                        <span>{row.resolution || 'unknown'}</span>
                        <span>{row.count}</span>
                      </div>
                    ))}
                    {!summary?.byResolution?.length && <div className="text-sm text-[var(--text-secondary)]">{isZh ? '无数据' : 'No data'}</div>}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-[var(--surface-1,#111827)] border border-[var(--border-soft,#334155)]">
                  <div className="text-xs text-[var(--text-secondary,#94a3b8)]">{isZh ? '按宽高比' : 'By aspect ratio'}</div>
                  <div className="mt-2 space-y-1">
                    {(summary?.byAspectRatio || []).map((row) => (
                      <div key={row.aspect_ratio || 'unknown'} className="flex justify-between text-sm text-[var(--text-primary,#e2e8f0)]">
                        <span>{row.aspect_ratio || 'unknown'}</span>
                        <span>{row.count}</span>
                      </div>
                    ))}
                    {!summary?.byAspectRatio?.length && <div className="text-sm text-[var(--text-secondary)]">{isZh ? '无数据' : 'No data'}</div>}
                  </div>
                </div>
              </>
            )}
          </section>

          <section className="rounded-xl border border-[var(--border-soft,#334155)] bg-[var(--surface-1,#111827)] p-3 space-y-3">
            <div className="flex flex-wrap gap-2 items-end">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[var(--text-secondary)]">{isZh ? '用户邮箱' : 'User email'}</label>
                <input
                  className="rounded-lg border border-[var(--border-soft,#334155)] bg-[var(--surface-input,#0b1220)] px-3 py-2 text-sm text-[var(--text-primary,#e5e7eb)] focus:border-[var(--accent,#8b5cf6)] focus:outline-none"
                  placeholder="user@example.com"
                  value={filters.userEmail}
                  onChange={(e) => setFilters((f) => ({ ...f, userEmail: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[var(--text-secondary)]">{isZh ? '类型' : 'Kind'}</label>
                <select
                  className="rounded-lg border border-[var(--border-soft,#334155)] bg-[var(--surface-input,#0b1220)] px-3 py-2 text-sm text-[var(--text-primary,#e5e7eb)] focus:border-[var(--accent,#8b5cf6)] focus:outline-none"
                  value={filters.kind}
                  onChange={(e) => setFilters((f) => ({ ...f, kind: e.target.value }))}
                >
                  {kindOptions.map((k) => (
                    <option key={k.id} value={k.id}>{k.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[var(--text-secondary)]">{isZh ? '分辨率' : 'Resolution'}</label>
                <select
                  className="rounded-lg border border-[var(--border-soft,#334155)] bg-[var(--surface-input,#0b1220)] px-3 py-2 text-sm text-[var(--text-primary,#e5e7eb)] focus:border-[var(--accent,#8b5cf6)] focus:outline-none"
                  value={filters.resolution}
                  onChange={(e) => setFilters((f) => ({ ...f, resolution: e.target.value }))}
                >
                  {resolutionOptions.map((r) => (
                    <option key={r.id} value={r.id}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[var(--text-secondary)]">{isZh ? '宽高比' : 'Aspect'}</label>
                <select
                  className="rounded-lg border border-[var(--border-soft,#334155)] bg-[var(--surface-input,#0b1220)] px-3 py-2 text-sm text-[var(--text-primary,#e5e7eb)] focus:border-[var(--accent,#8b5cf6)] focus:outline-none"
                  value={filters.aspectRatio}
                  onChange={(e) => setFilters((f) => ({ ...f, aspectRatio: e.target.value }))}
                >
                  {aspectOptions.map((r) => (
                    <option key={r.id} value={r.id}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[var(--text-secondary)]">{isZh ? '开始时间' : 'Start'}</label>
                <input
                  className="rounded-lg border border-[var(--border-soft,#334155)] bg-[var(--surface-input,#0b1220)] px-3 py-2 text-sm text-[var(--text-primary,#e5e7eb)] focus:border-[var(--accent,#8b5cf6)] focus:outline-none"
                  type="datetime-local"
                  value={filters.start}
                  onChange={(e) => setFilters((f) => ({ ...f, start: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[var(--text-secondary)]">{isZh ? '结束时间' : 'End'}</label>
                <input
                  className="rounded-lg border border-[var(--border-soft,#334155)] bg-[var(--surface-input,#0b1220)] px-3 py-2 text-sm text-[var(--text-primary,#e5e7eb)] focus:border-[var(--accent,#8b5cf6)] focus:outline-none"
                  type="datetime-local"
                  value={filters.end}
                  onChange={(e) => setFilters((f) => ({ ...f, end: e.target.value }))}
                />
              </div>
              <button
                type="button"
                className="h-10 px-4 rounded-lg bg-[var(--accent,#8b5cf6)] text-white text-sm font-semibold hover:opacity-90 disabled:opacity-60"
                onClick={onApplyFilters}
                disabled={loading}
              >
                {isZh ? '筛选' : 'Apply'}
              </button>
            </div>
          </section>

          <section className="rounded-xl border border-[var(--border-soft,#334155)] bg-[var(--surface-1,#111827)]">
            <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-soft,#334155)]">
              <div className="text-sm font-semibold text-[var(--text-primary)]">
                {isZh ? '图片记录' : 'Image records'} ({total})
              </div>
              <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                <span>{isZh ? '每页' : 'Page size'}</span>
                <select
                  className="h-8 rounded-lg border border-[var(--border-soft,#334155)] bg-[var(--surface-input,#0b1220)] px-2 py-1 text-sm text-[var(--text-primary,#e5e7eb)] focus:border-[var(--accent,#8b5cf6)] focus:outline-none"
                  value={limit}
                  onChange={(e) => {
                    const next = parseInt(e.target.value, 10) || 20;
                    setLimit(next);
                    loadList(0, next);
                  }}
                >
                  {[10, 20, 50, 100].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <button
                  className="px-2 py-1 rounded-md border border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-soft)] disabled:opacity-50"
                  onClick={() => onPageChange('prev')}
                  disabled={offset === 0 || loading}
                >
                  {isZh ? '上一页' : 'Prev'}
                </button>
                <button
                  className="px-2 py-1 rounded-md border border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-soft)] disabled:opacity-50"
                  onClick={() => onPageChange('next')}
                  disabled={offset + limit >= total || loading}
                >
                  {isZh ? '下一页' : 'Next'}
                </button>
              </div>
            </div>

            {error && (
              <div className="p-3">
                <ErrorMessage message={error} />
              </div>
            )}
            {loading ? (
              <div className="p-6 flex justify-center">
                <LoadingSpinner message={isZh ? '加载中...' : 'Loading...'} />
              </div>
            ) : (
              <div className="overflow-auto max-h-[40vh]">
                <table className="min-w-full text-sm">
                  <thead className="bg-[var(--surface-2,#0b1220)] text-[var(--text-secondary,#94a3b8)]">
                    <tr>
                      <th className="px-3 py-2 text-left">User</th>
                      <th className="px-3 py-2 text-left">Tier</th>
                      <th className="px-3 py-2 text-left">Kind</th>
                      <th className="px-3 py-2 text-left">Resolution</th>
                      <th className="px-3 py-2 text-left">Aspect</th>
                      <th className="px-3 py-2 text-left">Size</th>
                      <th className="px-3 py-2 text-left">Time</th>
                      <th className="px-3 py-2 text-left">Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((row) => (
                      <tr key={row.id} className="border-b border-[var(--border-soft,#1f2937)] text-[var(--text-primary,#e5e7eb)]">
                        <td className="px-3 py-2">
                          <div className="flex flex-col">
                            <span className="font-semibold">{row.user_email || '-'}</span>
                            <span className="text-[11px] text-[var(--text-secondary)]">{row.display_name || '-'}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            className="rounded-lg border border-[var(--border-soft,#334155)] bg-[var(--surface-input,#0b1220)] px-2 py-1 text-xs text-[var(--text-primary,#e5e7eb)] focus:border-[var(--accent,#8b5cf6)] focus:outline-none uppercase"
                            value={row.user_tier || 'user'}
                            disabled={!row.user_id || !!tierUpdating[row.user_id]}
                            onChange={(e) => updateTier(row.user_id, e.target.value)}
                          >
                            {['user', 'vip', 'svip', 'admin'].map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">{row.kind || '-'}</td>
                        <td className="px-3 py-2">{row.resolution || '-'}</td>
                        <td className="px-3 py-2">{row.aspect_ratio || '-'}</td>
                        <td className="px-3 py-2">
                          {row.width && row.height ? `${row.width}x${row.height}` : '-'}
                        </td>
                        <td className="px-3 py-2 text-[11px] text-[var(--text-secondary)]">{formatDate(row.created_at)}</td>
                        <td className="px-3 py-2">
                          {row.s3_url ? (
                            <a
                              className="text-[var(--accent,#8b5cf6)] underline"
                              href={row.s3_url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              link
                            </a>
                          ) : (
                            '-'
                          )}
                        </td>
                      </tr>
                    ))}
                    {!items.length && (
                      <tr>
                        <td className="px-3 py-4 text-center text-[var(--text-secondary)]" colSpan={8}>
                          {isZh ? '暂无记录' : 'No records'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* 用户管理 */}
          <section className="rounded-xl border border-[var(--border-soft,#334155)] bg-[var(--surface-1,#111827)] p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-base font-semibold text-[var(--text-primary,#e2e8f0)]">{isZh ? '用户管理' : 'User management'}</div>
                <div className="text-xs text-[var(--text-secondary,#94a3b8)]">{isZh ? '查看与调整权限' : 'Inspect and adjust access'}</div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  className="rounded-lg border border-[var(--border-soft,#334155)] bg-[var(--surface-input,#0b1220)] px-3 py-2 text-sm text-[var(--text-primary,#e5e7eb)] focus:border-[var(--accent,#8b5cf6)] focus:outline-none"
                  placeholder={isZh ? '邮箱过滤' : 'Filter by email'}
                  value={userFilters.email}
                  onChange={(e) => setUserFilters((f) => ({ ...f, email: e.target.value }))}
                />
                <button
                  type="button"
                  className="icon-button"
                  title={isZh ? '刷新用户' : 'Refresh users'}
                  onClick={() => loadUsers(0, userLimit)}
                >
                  <ArrowPathIcon className="h-5 w-5" />
                </button>
              </div>
            </div>

            {userError && <ErrorMessage message={userError} />}
            {userLoading ? (
              <div className="flex justify-center py-6">
                <LoadingSpinner message={isZh ? '加载用户...' : 'Loading users...'} />
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-[var(--border-soft,#334155)]">
                <table className="min-w-full text-sm text-left">
                  <thead className="bg-[var(--surface-2,#0b1220)] text-[var(--text-secondary,#94a3b8)]">
                    <tr>
                      <th className="px-3 py-2">User</th>
                      <th className="px-3 py-2">{isZh ? '角色' : 'Role'}</th>
                      <th className="px-3 py-2">{isZh ? '权限层级' : 'Tier'}</th>
                      <th className="px-3 py-2">{isZh ? '次数(生/编/总)' : 'Counts (gen/edit/total)'}</th>
                      <th className="px-3 py-2">{isZh ? '最近' : 'Last activity'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-soft,#334155)] text-[var(--text-primary,#e2e8f0)]">
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td className="px-3 py-2">
                          <div className="flex flex-col">
                            <span className="font-semibold">{u.displayName || u.email}</span>
                            <span className="text-[11px] text-[var(--text-secondary,#94a3b8)]">{u.email}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            className="rounded-md border border-[var(--border-soft,#334155)] bg-[var(--surface-input,#0b1220)] px-2 py-1 text-sm"
                            value={u.role}
                            disabled={!!userUpdating[u.id]}
                            onChange={(e) => handleUserAccessChange(u.id, e.target.value as UserRole, undefined)}
                          >
                            {['user', 'admin'].map((r) => (
                              <option key={r} value={r}>{r}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            className="rounded-md border border-[var(--border-soft,#334155)] bg-[var(--surface-input,#0b1220)] px-2 py-1 text-sm"
                            value={u.tier}
                            disabled={!!userUpdating[u.id]}
                            onChange={(e) => handleUserAccessChange(u.id, undefined, e.target.value as UserTier)}
                          >
                            {['user', 'vip', 'svip', 'admin'].map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {u.generateCount}/{u.editCount}/{u.totalImages}
                        </td>
                        <td className="px-3 py-2 text-[var(--text-secondary,#94a3b8)]">
                          {u.lastCreatedAt ? formatDate(u.lastCreatedAt) : '-'}
                        </td>
                      </tr>
                    ))}
                    {!users.length && (
                      <tr>
                        <td className="px-3 py-4 text-center text-[var(--text-secondary,#94a3b8)]" colSpan={5}>
                          {isZh ? '暂无用户' : 'No users'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary,#94a3b8)]">
              <span>
                {isZh ? '共' : 'Total'} {userTotal} {isZh ? '人' : 'users'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  className="icon-button"
                  onClick={() => onUserPageChange('prev')}
                  disabled={userOffset === 0}
                >
                  ‹
                </button>
                <button
                  className="icon-button"
                  onClick={() => onUserPageChange('next')}
                  disabled={userOffset + userLimit >= userTotal}
                >
                  ›
                </button>
              </div>
            </div>
          </section>

          {/* 模板预置图管理（BananaPro 最佳实践） */}
          <section className="rounded-xl border border-[var(--border-soft,#334155)] bg-[var(--surface-1,#111827)] p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-base font-semibold text-[var(--text-primary,#e2e8f0)]">{isZh ? '最佳模板图片' : 'Default template images'}</div>
                <div className="text-xs text-[var(--text-secondary,#94a3b8)]">{isZh ? '按模板/分辨率/比例上传或替换' : 'Per template/resolution/ratio'}</div>
              </div>
              <div className="flex items-center gap-2">
                <select
                  className="h-9 rounded-lg border border-[var(--border-soft,#334155)] bg-[var(--surface-input,#0b1220)] px-2 text-sm text-[var(--text-primary)]"
                  value={tplRatio}
                  onChange={(e) => setTplRatio(e.target.value)}
                >
                  {ASPECT_RATIO_OPTIONS.map((r) => (
                    <option key={r.id} value={r.id}>{r.id}</option>
                  ))}
                </select>
                <select
                  className="h-9 rounded-lg border border-[var(--border-soft,#334155)] bg-[var(--surface-input,#0b1220)] px-2 text-sm text-[var(--text-primary)]"
                  value={tplResolution}
                  onChange={(e) => setTplResolution(e.target.value)}
                >
                  {RESOLUTION_OPTIONS.map((r) => (
                    <option key={r.id} value={r.id}>{r.id}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="icon-button"
                  title={isZh ? '刷新模板' : 'Refresh templates'}
                  onClick={loadTemplatesPro}
                >
                  <ArrowPathIcon className="h-5 w-5" />
                </button>
              </div>
            </div>

            {tplError && <ErrorMessage message={tplError} />}
            {tplLoading ? (
              <div className="flex justify-center py-6">
                <LoadingSpinner message={isZh ? '加载模板...' : 'Loading templates...'} />
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-[var(--border-soft,#334155)]">
                <table className="min-w-full text-sm text-left">
                  <thead className="bg-[var(--surface-2,#0b1220)] text-[var(--text-secondary,#94a3b8)]">
                    <tr>
                      <th className="px-3 py-2">{isZh ? '模板' : 'Template'}</th>
                      <th className="px-3 py-2">{isZh ? '当前预置图' : 'Current default'}</th>
                      <th className="px-3 py-2">{isZh ? '操作' : 'Actions'}</th>
                      <th className="px-3 py-2">{isZh ? '上传/替换' : 'Upload/replace'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-soft,#334155)] text-[var(--text-primary,#e2e8f0)]">
                    {templatesPro.map((tpl) => {
                      const key = `${tplRatio}|${tplResolution}`;
                      const url = tpl.defaultImages?.[key]?.url || tpl.defaultImages?.[key]?.signedUrl || tpl.defaultImages?.[key];
                      return (
                        <tr key={tpl.id}>
                          <td className="px-3 py-2">
                            <div className="flex flex-col">
                              <span className="font-semibold">{tpl.nameZh || tpl.nameEn || tpl.name}</span>
                              <span className="text-[11px] text-[var(--text-secondary,#94a3b8)]">{tpl.type || ''}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            {url ? (
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  className="text-[var(--accent,#8b5cf6)] underline"
                                  onClick={() => setTplPreview({ url, title: tpl.nameZh || tpl.nameEn || tpl.name })}
                                >
                                  {isZh ? '查看' : 'View'}
                                </button>
                                <button
                                  type="button"
                                  className="text-[var(--text-secondary,#94a3b8)] hover:text-red-400 text-xs"
                                  disabled={!!tplDeleteState[tpl.id]}
                                  onClick={async () => {
                                    if (!window.confirm(isZh ? '确认删除该预置图？' : 'Delete this default image?')) return;
                                    setTplDeleteState((m) => ({ ...m, [tpl.id]: true }));
                                    try {
                                      await templateAPI.deleteDefaultImage(tpl.id, { ratio: tplRatio, resolution: tplResolution });
                                      await loadTemplatesPro();
                                    } catch (err: any) {
                                      // 404/410 视为已删除
                                      if (err?.status === 404 || err?.status === 410 || err?.error === 'Template not found' || err?.error === 'Default image not found') {
                                        await loadTemplatesPro();
                                      } else {
                                        setTplError(err?.message || '删除失败');
                                      }
                                    } finally {
                                      setTplDeleteState((m) => {
                                        const clone = { ...m };
                                        delete clone[tpl.id];
                                        return clone;
                                      });
                                    }
                                  }}
                                >
                                  {tplDeleteState[tpl.id] ? (isZh ? '删除中...' : 'Deleting...') : (isZh ? '删除' : 'Delete')}
                                </button>
                              </div>
                            ) : (
                              <span className="text-[var(--text-secondary,#94a3b8)]">{isZh ? '暂无' : 'None'}</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <label className="inline-flex items-center gap-2 cursor-pointer text-[var(--accent,#8b5cf6)]">
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  setTplUploadState((m) => ({ ...m, [tpl.id]: true }));
                                  try {
                                    const b64 = await fileToDataUrl(file);
                                    await templateAPI.setDefaultImage(tpl.id, {
                                      ratio: tplRatio,
                                      resolution: tplResolution,
                                      dataUrl: b64,
                                      allowOverride: true
                                    });
                                    await loadTemplatesPro();
                                  } catch (err: any) {
                                    setTplError(err?.message || '上传失败');
                                  } finally {
                                    setTplUploadState((m) => {
                                      const clone = { ...m };
                                      delete clone[tpl.id];
                                      return clone;
                                    });
                                    if (e.target) e.target.value = '';
                                  }
                                }}
                              />
                              <span className="px-3 py-1 rounded-lg border border-[var(--accent,#8b5cf6)] text-xs">
                                {tplUploadState[tpl.id] ? (isZh ? '上传中...' : 'Uploading...') : isZh ? '上传' : 'Upload'}
                              </span>
                            </label>
                          </td>
                        </tr>
                      );
                    })}
                    {!templatesPro.length && (
                      <tr>
                        <td className="px-3 py-4 text-center text-[var(--text-secondary,#94a3b8)]" colSpan={4}>
                          {isZh ? '暂无模板' : 'No templates'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {tplPreview && (
            <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center px-4" onClick={() => setTplPreview(null)}>
              <div className="relative max-w-4xl max-h-[90vh] bg-[var(--surface-1,#111827)] border border-[var(--border-soft,#334155)] rounded-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border-soft,#334155)]">
                  <div className="text-sm font-semibold text-[var(--text-primary,#e2e8f0)] truncate">{tplPreview.title}</div>
                  <button className="icon-button" onClick={() => setTplPreview(null)} aria-label="Close preview">
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>
                <div className="p-4 grid place-items-center">
                  <img src={tplPreview.url} alt={tplPreview.title} className="max-h-[70vh] max-w-full object-contain rounded-lg" />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// 工具函数：File -> dataURL
const fileToDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
};
