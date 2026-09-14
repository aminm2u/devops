import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { MultiSelect, Option } from '@/components/ui/multi-select';
import {
  Calendar, Trash2, Send, Clock, UserPlus, UserMinus,
  ArrowRight, MessageSquare, Plus, Edit, GripVertical
} from 'lucide-react';
import apiClient from '@/api/client';
import toast from 'react-hot-toast';
import { useSocket } from '@/hooks/useSocket';

interface TaskDetailModalProps {
  taskId: number | null;
  open: boolean;
  onClose: () => void;
  onDelete: (taskId: number) => void;
  members: any[];
}

export function TaskDetailModal({ taskId, open, onClose, onDelete, members }: TaskDetailModalProps) {
  const [task, setTask] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [comment, setComment] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const [editAssignees, setEditAssignees] = useState(false);
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [savingAssignees, setSavingAssignees] = useState(false);
  const commentsEndRef = useRef<HTMLDivElement>(null);
  const { socket } = useSocket();

  const assigneeOptions: Option[] = members.map((m: any) => ({
    label: m.user.name,
    value: String(m.userId),
  }));

  useEffect(() => {
    if (open && taskId) {
      fetchTask();
      setEditAssignees(false);
    }
  }, [open, taskId]);

  useEffect(() => {
    if (socket && taskId) {
      const handleActivity = (data: any) => {
        if (data.taskId === taskId) {
          setTask((prev: any) => ({
            ...prev,
            activities: [...(prev?.activities || []), data.activity],
          }));
        }
      };
      const handleComment = (data: any) => {
        if (data.taskId === taskId) {
          setTask((prev: any) => ({
            ...prev,
            comments: [...(prev?.comments || []), data.comment],
          }));
        }
      };
      socket.on('task-activity', handleActivity);
      socket.on('task-comment', handleComment);
      return () => {
        socket.off('task-activity', handleActivity);
        socket.off('task-comment', handleComment);
      };
    }
  }, [socket, taskId]);

  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [task?.comments]);

  const fetchTask = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get(`/tasks/${taskId}`);
      const data = res.data.data;
      setTask(data);
      setSelectedAssignees((data.assignees || []).map(String));
    } catch (err) {
      toast.error('Failed to load task');
    } finally {
      setLoading(false);
    }
  };

  const handleAddComment = async () => {
    if (!comment.trim() || !taskId) return;
    try {
      setSendingComment(true);
      const res = await apiClient.post(`/tasks/${taskId}/comments`, { content: comment });
      setTask((prev: any) => ({
        ...prev,
        comments: [...(prev?.comments || []), res.data.data],
      }));
      setComment('');
    } catch (err) {
      toast.error('Failed to add comment');
    } finally {
      setSendingComment(false);
    }
  };

  const handleSaveAssignees = async () => {
    if (!taskId) return;
    try {
      setSavingAssignees(true);
      await apiClient.put(`/tasks/${taskId}`, {
        assignees: selectedAssignees.map(Number),
      });
      toast.success('Assignees updated');
      setEditAssignees(false);
      fetchTask(); // refresh to get new activity logs
    } catch (err) {
      toast.error('Failed to update assignees');
    } finally {
      setSavingAssignees(false);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-500 text-white';
      case 'high': return 'bg-orange-500 text-white';
      case 'medium': return 'bg-yellow-500 text-white';
      case 'low': return 'bg-green-500 text-white';
      default: return 'bg-gray-200';
    }
  };

  const getInitials = (name: string) =>
    name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);

  const getActivityIcon = (action: string) => {
    switch (action) {
      case 'created': return <Plus className="h-3.5 w-3.5 text-green-600" />;
      case 'moved': return <ArrowRight className="h-3.5 w-3.5 text-blue-600" />;
      case 'commented': return <MessageSquare className="h-3.5 w-3.5 text-purple-600" />;
      case 'assigned': return <UserPlus className="h-3.5 w-3.5 text-emerald-600" />;
      case 'unassigned': return <UserMinus className="h-3.5 w-3.5 text-red-500" />;
      case 'updated': return <Edit className="h-3.5 w-3.5 text-amber-600" />;
      default: return <Clock className="h-3.5 w-3.5 text-slate-400" />;
    }
  };

  const getActivityDescription = (activity: any) => {
    const d = activity.details || {};
    const userName = activity.user?.name || 'Unknown';
    switch (activity.action) {
      case 'created':
        return <><strong>{userName}</strong> created this task in <Badge variant="outline" className="text-[10px]">{d.column}</Badge></>;
      case 'moved':
        return <><strong>{userName}</strong> moved from <Badge variant="outline" className="text-[10px]">{d.from}</Badge> <ArrowRight className="inline h-3 w-3" /> <Badge variant="outline" className="text-[10px]">{d.to}</Badge></>;
      case 'commented':
        return <><strong>{userName}</strong> commented: <em className="text-slate-500">"{d.preview}"</em></>;
      case 'assigned':
        return <><strong>{userName}</strong> assigned <strong>{d.assigneeName}</strong></>;
      case 'unassigned':
        return <><strong>{userName}</strong> unassigned <strong>{d.assigneeName}</strong></>;
      case 'updated':
        return <><strong>{userName}</strong> updated {d.fields?.join(', ')}</>;
      default:
        return <><strong>{userName}</strong> performed an action</>;
    }
  };

  // Merge activities and comments into a single timeline, sorted by time
  const buildTimeline = () => {
    const items: any[] = [];

    (task?.activities || []).forEach((a: any) => {
      items.push({ type: 'activity', data: a, time: new Date(a.createdAt) });
    });
    (task?.comments || []).forEach((c: any) => {
      items.push({ type: 'comment', data: c, time: new Date(c.createdAt) });
    });

    items.sort((a, b) => a.time.getTime() - b.time.getTime());
    return items;
  };

  // Calculate time contributed per assignee (from first activity to now)
  const getAssigneeStats = () => {
    if (!task?.assigneeDetails) return [];
    return task.assigneeDetails.map((a: any) => {
      const assignActivities = (task.activities || []).filter(
        (act: any) => act.action === 'assigned' && act.details?.assigneeId === a.id
      );
      const commentCount = (task.comments || []).filter(
        (c: any) => c.userId === a.id
      ).length;
      const assignedAt = assignActivities.length > 0 ? new Date(assignActivities[0].createdAt) : null;
      const hoursActive = assignedAt
        ? Math.round((Date.now() - assignedAt.getTime()) / (1000 * 60 * 60))
        : 0;

      return { ...a, commentCount, assignedAt, hoursActive };
    });
  };

  if (!open) return null;

  const timeline = buildTimeline();
  const assigneeStats = getAssigneeStats();

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl">{loading ? 'Loading...' : task?.title || 'Task'}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Clock className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : task ? (
          <div className="flex-1 overflow-y-auto flex flex-col gap-5 pr-1">
            {/* Meta badges */}
            <div className="flex flex-wrap gap-3 items-center">
              <Badge className={getPriorityColor(task.priority)}>{task.priority}</Badge>
              {task.column && <Badge variant="outline">{task.column.name}</Badge>}
              {task.dueDate && (
                <div className="flex items-center gap-1 text-sm text-slate-500">
                  <Calendar className="h-3.5 w-3.5" />
                  {new Date(task.dueDate).toLocaleDateString()}
                </div>
              )}
            </div>

            {/* Description */}
            {task.description && (
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{task.description}</p>
              </div>
            )}

            <Separator />

            {/* Assignees Section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <UserPlus className="h-4 w-4" />
                  Assigned Team Members
                </h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditAssignees(!editAssignees)}
                >
                  {editAssignees ? 'Cancel' : 'Edit'}
                </Button>
              </div>

              {editAssignees ? (
                <div className="space-y-3">
                  <MultiSelect
                    options={assigneeOptions}
                    selected={selectedAssignees}
                    onChange={setSelectedAssignees}
                    placeholder="Select team members..."
                  />
                  <Button size="sm" onClick={handleSaveAssignees} disabled={savingAssignees}>
                    {savingAssignees ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {assigneeStats.length > 0 ? (
                    assigneeStats.map((a: any) => (
                      <div key={a.id} className="flex items-center gap-3 bg-slate-50 rounded-lg p-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs bg-blue-100 text-blue-700">
                            {getInitials(a.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{a.name}</span>
                            <span className="text-xs text-slate-400">{a.email}</span>
                          </div>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-[11px] text-slate-500 flex items-center gap-1">
                              <MessageSquare className="h-3 w-3" />
                              {a.commentCount} updates
                            </span>
                            {a.assignedAt && (
                              <span className="text-[11px] text-slate-500 flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {a.hoursActive < 1 ? '<1' : a.hoursActive}h active
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-400">No one assigned yet</p>
                  )}
                </div>
              )}
            </div>

            <Separator />

            {/* Activity Timeline */}
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Activity History
              </h4>
              <div className="space-y-0 max-h-[350px] overflow-y-auto pr-2">
                {timeline.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-4">No activity yet</p>
                )}
                {timeline.map((item, idx) => (
                  <div key={idx} className="flex gap-3 group">
                    {/* Timeline line */}
                    <div className="flex flex-col items-center">
                      <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                        {item.type === 'comment'
                          ? <MessageSquare className="h-3.5 w-3.5 text-purple-600" />
                          : getActivityIcon(item.data.action)}
                      </div>
                      {idx < timeline.length - 1 && (
                        <div className="w-px flex-1 bg-slate-200 min-h-[20px]" />
                      )}
                    </div>

                    <div className="flex-1 pb-4 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-400">
                          {item.time.toLocaleString()}
                        </span>
                      </div>
                      {item.type === 'comment' ? (
                        <div className="mt-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Avatar className="h-5 w-5">
                              <AvatarFallback className="text-[9px] bg-slate-200 text-slate-700">
                                {getInitials(item.data.user?.name || '?')}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-xs font-semibold">{item.data.user?.name}</span>
                          </div>
                          <div className="bg-white border rounded-lg p-2.5 text-sm text-slate-700 whitespace-pre-wrap">
                            {item.data.content}
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-slate-600 mt-0.5">
                          {getActivityDescription(item.data)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={commentsEndRef} />
              </div>
            </div>

            <Separator />

            {/* Comment Input */}
            <div className="flex gap-2">
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Write an update... (e.g. 'Working on the API integration', 'Blocked by vendor')"
                rows={2}
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleAddComment();
                  }
                }}
              />
              <Button
                onClick={handleAddComment}
                disabled={!comment.trim() || sendingComment}
                className="self-end"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : null}

        <DialogFooter className="flex justify-between items-center pt-2">
          <Button
            variant="ghost"
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={() => { if (taskId) onDelete(taskId); }}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete Task
          </Button>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
