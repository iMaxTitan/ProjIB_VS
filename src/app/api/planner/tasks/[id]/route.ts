/**
 * /api/planner/tasks/[id] — PATCH and DELETE for individual tasks.
 * PATCH { spent_hours?, task_type?, description?, title?, monthly_plan_id? } -> { ok: true }
 * DELETE -> { ok: true }
 *
 * Role-aware:
 *  - Owner (user_id = current): can edit fields, submit for approval, delete
 *  - Chief/Head: can approve/reject tasks of their subordinates
 *  - Creator (created_by = current): can delete tasks they assigned to others
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  isRequestAuthorized,
  getRequesterKey,
  getDbUserId,
  checkRateLimit,
} from '@/lib/shared/api/request-guards';
import { getServerDb as getDb } from '@/lib/shared/db-server';
import logger from '@/lib/shared/logger';

const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;
const VALID_TASK_TYPES = ['draft', 'incomplete', 'completed', 'pending_approval', 'rejected'] as const;

type RouteContext = { params: Promise<{ id: string }> };

// --- PATCH -------------------------------------------------------------

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const rl = checkRateLimit(`task-id:${getRequesterKey(req)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too Many Requests' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }
  const userId = getDbUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 401 });
  }

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: 'Missing task id' }, { status: 400 });
  }

  try {
    const db = getDb();

    // Fetch task + current user role
    const { data: task, error: fetchErr } = await db
      .from('daily_tasks')
      .select('user_id, created_by, source, task_type')
      .eq('daily_task_id', id)
      .single();

    if (fetchErr || !task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const { data: userProfile } = await db
      .from('user_profiles')
      .select('role')
      .eq('user_id', userId)
      .single();

    const userRole = userProfile?.role || 'employee';
    const isOwner = task.user_id === userId;
    const isCreator = task.created_by === userId;
    const isManager = userRole === 'chief' || userRole === 'head';

    const body = await req.json();
    const updates: Record<string, unknown> = {};

    // Task type change — role-aware
    if (body.task_type !== undefined) {
      if (!(VALID_TASK_TYPES as readonly string[]).includes(body.task_type)) {
        return NextResponse.json({ error: 'Invalid task_type' }, { status: 400 });
      }

      const newType = body.task_type as string;

      // Employee: can submit for approval or revert to draft
      if (isOwner && !isManager) {
        if (!['pending_approval', 'draft', 'incomplete'].includes(newType)) {
          return NextResponse.json({ error: 'Employee can only submit for approval or revert to draft' }, { status: 403 });
        }
      }

      // Manager: can approve (completed) or reject
      if (!isOwner && isManager) {
        if (!['completed', 'rejected'].includes(newType)) {
          return NextResponse.json({ error: 'Manager can only approve or reject' }, { status: 403 });
        }
      }

      // Neither owner nor manager — forbidden
      if (!isOwner && !isManager) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      updates.task_type = newType;
    }

    // Other field updates — owner only
    if (body.spent_hours !== undefined) {
      if (!isOwner) return NextResponse.json({ error: 'Only owner can edit hours' }, { status: 403 });
      updates.spent_hours = Number(body.spent_hours);
    }
    if (body.description !== undefined) {
      if (!isOwner) return NextResponse.json({ error: 'Only owner can edit description' }, { status: 403 });
      updates.description = body.description;
    }
    if (body.title !== undefined) {
      if (!isOwner) return NextResponse.json({ error: 'Only owner can edit title' }, { status: 403 });
      updates.title = body.title;
    }
    if (body.monthly_plan_id !== undefined) {
      if (!isOwner) return NextResponse.json({ error: 'Only owner can assign plan' }, { status: 403 });
      updates.monthly_plan_id = body.monthly_plan_id;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    // Timestamps
    if (updates.task_type === 'completed') {
      updates.completed_at = new Date().toISOString();
    }
    if (updates.task_type === 'rejected' || updates.task_type === 'draft') {
      updates.completed_at = null;
    }

    const { error: updateErr } = await db
      .from('daily_tasks')
      .update(updates)
      .eq('daily_task_id', id);

    if (updateErr) throw updateErr;

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('[planner/tasks/[id]] PATCH error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// --- DELETE ------------------------------------------------------------

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const rl = checkRateLimit(`task-id:${getRequesterKey(req)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too Many Requests' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }
  const userId = getDbUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 401 });
  }

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: 'Missing task id' }, { status: 400 });
  }

  try {
    const db = getDb();

    const { data: task, error: fetchErr } = await db
      .from('daily_tasks')
      .select('user_id, created_by')
      .eq('daily_task_id', id)
      .single();

    if (fetchErr || !task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Can delete: owner OR creator (chief/head who assigned the task)
    const isOwner = task.user_id === userId;
    const isCreator = task.created_by === userId;
    if (!isOwner && !isCreator) {
      return NextResponse.json({ error: 'Forbidden: only owner or creator can delete' }, { status: 403 });
    }

    // Unlink from calendar entries
    await db
      .from('weekly_calendar_entries')
      .update({ daily_task_id: null })
      .eq('daily_task_id', id);

    // Delete task companies
    await db
      .from('daily_task_companies')
      .delete()
      .eq('daily_task_id', id);

    // Delete the task
    const { error: delErr } = await db
      .from('daily_tasks')
      .delete()
      .eq('daily_task_id', id);

    if (delErr) throw delErr;

    logger.info(`[planner/tasks/[id]] Deleted task ${id} by ${userId}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('[planner/tasks/[id]] DELETE error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
