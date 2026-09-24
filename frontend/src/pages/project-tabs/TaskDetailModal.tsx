import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { MultiSelect, Option } from '@/components/ui/multi-select';
import {
  Calendar, Trash2, Send, Clock, UserPlus, UserMinus,
  ArrowRight, MessageSquare, Plus, Edit, Check, X,
  ChevronDown, ChevronRight, Timer
} from 'lucide-react';
import { DatePicker } from '@/components/ui/date-picker';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter,
  AlertDialogCancel, AlertDialogAction
} from '@/components/ui/alert-dialog';
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
  const [workingHours, setWorkingHours] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const [editAssignees, setEditAssignees] = useState(false);
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [savingAssignees, setSavingAssignees] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [editingDueDate, setEditingDueDate] = useState(false);
  const [dueDateValue, setDueDateValue] = useState('');
  const [activityOpen, setActivityOpen] = useState(false);
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
      setEditingDueDate(false);
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
      const res = await apiClient.post(`/tasks/${taskId}/comments`, {
        content: comment,
        workingHours: workingHours ? parseFloat(workingHours) : null,
      });
      setTask((prev: any) => ({
        ...prev,
        comments: [...(prev?.comments || []), res.data.data],
      }));
      setComment('');
      setWorkingHours('');
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
      fetchTask();
    } catch (err) {
      toast.error('Failed to update assignees');
    } finally {
      setSavingAssignees(false);
    }
  };

  const handleSaveDueDate = async () => {
    if (!taskId) return;
    try {
      await apiClient.put(`/tasks/${taskId}`, {
        dueDate: dueDateValue ? new Date(dueDateValue).toISOString() : null,
      });
      toast.success('Due date updated');
      setEditingDueDate(false);
      fetchTask();
    } catch (err) {
      toast.error('Failed to update due date');
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-500/15 text-red-400 border-red-500/30';
      case 'high': return 'bg-orange-500/15 text-orange-400 border-orange-500/30';
      case 'medium': return 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30';
      case 'low': return 'bg-green-500/15 text-green-400 border-green-500/30';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getInitials = (name: string) =>
    name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);

  const getActivityIcon = (action: string) => {
    switch (action) {
      case 'created': return <Plus className="h-3.5 w-3.5 text-green-500" />;
      case 'moved': return <ArrowRight className="h-3.5 w-3.5 text-blue-500" />;
      case 'commented': return <MessageSquare className="h-3.5 w-3.5 text-purple-500" />;
      case 'assigned': return <UserPlus className="h-3.5 w-3.5 text-emerald-500" />;
      case 'unassigned': return <UserMinus className="h-3.5 w-3.5 text-red-500" />;
      case 'updated': return <Edit className="h-3.5 w-3.5 text-amber-500" />;
      default: return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  const getActivityDescription = (activity: any) => {
    const d = activity.details || {};
    const userName = activity.user?.name || 'Unknown';
    switch (activity.action) {
      case 'created':
        return <><strong>{userName}</strong> created this task in &nbsp; <Badge variant="outline" className="text-[9px]">{d.column}</Badge></>;
      case 'moved':
        return <><strong>{userName}</strong> moved from <Badge variant="outline" className="text-[10px]">{d.from}</Badge> <ArrowRight className="inline h-3 w-3" /> <Badge variant="outline" className="text-[10px]">{d.to}</Badge></>;
      case 'commented':
        return <><strong>{userName}</strong> commented: <em className="text-muted-foreground">"{d.preview}"</em></>;
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

  const getAssigneeStats = () => {
    if (!task?.assigneeDetails) return [];
    return task.assigneeDetails.map((a: any) => {
      const assignActivities = (task.activities || []).filter(
        (act: any) => act.action === 'assigned' && act.details?.assigneeId === a.id
      );
      const userComments = (task.comments || []).filter(
        (c: any) => c.userId === a.id
      );
      const commentCount = userComments.length;
      const totalHoursLogged = userComments.reduce(
        (sum: number, c: any) => sum + (parseFloat(c.workingHours) || 0), 0
      );
      const assignedAt = assignActivities.length > 0 ? new Date(assignActivities[0].createdAt) : null;
      const hoursActive = assignedAt
        ? Math.round((Date.now() - assignedAt.getTime()) / (1000 * 60 * 60))
        : 0;
      return { ...a, commentCount, totalHoursLogged, assignedAt, hoursActive };
    });
  };

  if (!open) return null;

  const timeline = buildTimeline();
  const assigneeStats = getAssigneeStats();

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0">
        <Card className="pt-2 border-0 shadow-none flex flex-col flex-1 min-h-0">
          <CardHeader>
            <CardTitle className="text-xl">{loading ? 'Loading...' : task?.title || 'Task'}</CardTitle>
          </CardHeader>

          <CardContent className="flex-1 min-h-0 flex flex-col">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Clock className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : task ? (
              <div className="flex-1 overflow-y-auto flex flex-col gap-4 pr-1 thin-scrollbar">
                {/* Meta badges */}
                <div className="flex flex-wrap gap-2 items-center mt-1">
                  <Badge className={`border text-[11px] px-2 py-0.5 ${getPriorityColor(task.priority)}`} variant="outline">{task.priority}</Badge>
                  {task.column && <Badge variant="outline" className="text-[11px] px-2 py-0.5">{task.column.name}</Badge>}

                  <div className="ml-auto">
                    {editingDueDate ? (
                      <div className="flex items-center gap-1.5">
                        <DatePicker value={dueDateValue} onChange={setDueDateValue} />
                        <Button size="icon" className="h-6 w-6" onClick={handleSaveDueDate}>
                          <Check className="h-3 w-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingDueDate(false)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setDueDateValue(task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : ''); setEditingDueDate(true); }}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      >
                        <Calendar className="h-3.5 w-3.5" />
                        {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'Set due date'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Description */}
                {task.description && (
                  <div className="bg-muted/50 rounded-lg px-4 py-3">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{task.description}</p>
                  </div>
                )}

                <Separator />

                {/* Assignees Section */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold flex items-center gap-2 text-foreground">
                      <UserPlus className="h-4 w-4 text-muted-foreground" />
                      Assigned Team Members
                    </h4>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditAssignees(!editAssignees)}>
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
                          <div key={a.id} className="flex items-center gap-3 bg-muted/50 rounded-lg p-3">
                            <Avatar className="h-9 w-9 shrink-0">
                              <AvatarFallback className="text-xs bg-primary/10 text-primary">
                                {getInitials(a.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium leading-tight">{a.name}</p>
                              <p className="text-[11px] text-muted-foreground truncate mt-0.5">{a.email}</p>
                              <div className="flex items-center gap-3 mt-1.5">
                                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                  <MessageSquare className="h-3 w-3" />
                                  {a.commentCount} updates
                                </span>
                                {a.totalHoursLogged > 0 && (
                                  <span className="text-[11px] text-primary font-medium flex items-center gap-1">
                                    <Timer className="h-3 w-3" />
                                    {a.totalHoursLogged}h logged
                                  </span>
                                )}
                                {a.assignedAt && (
                                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {a.hoursActive < 1 ? '<1' : a.hoursActive}h active
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-muted-foreground">No one assigned yet</p>
                      )}
                    </div>
                  )}
                </div>

                <Separator />

                {/* Activity Timeline */}
                <div>
                  <button
                    onClick={() => setActivityOpen(!activityOpen)}
                    className="w-full flex items-center gap-2 text-sm font-semibold text-foreground cursor-pointer hover:text-primary transition-colors"
                  >
                    {activityOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    Activity History
                    <Badge variant="secondary" className="ml-auto text-[10px]">{timeline.length}</Badge>
                  </button>
                  {activityOpen && (
                    <div className="space-y-0 max-h-[350px] overflow-y-auto pr-2 thin-scrollbar mt-3">
                      {timeline.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-4">No activity yet</p>
                      )}
                      {timeline.map((item, idx) => (
                        <div key={idx} className="flex gap-3 group">
                          <div className="flex flex-col items-center">
                            <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0">
                              {item.type === 'comment'
                                ? <MessageSquare className="h-3 w-3 text-purple-500" />
                                : getActivityIcon(item.data.action)}
                            </div>
                            {idx < timeline.length - 1 && (
                              <div className="w-px flex-1 bg-border min-h-[16px]" />
                            )}
                          </div>

                          <div className="flex-1 pb-4 min-w-0">
                            <span className="text-[11px] text-muted-foreground/70">
                              {item.time.toLocaleString()}
                            </span>
                            {item.type === 'comment' ? (
                              <div className="mt-1.5">
                                <div className="flex items-center gap-2 mb-1">
                                  <Avatar className="h-5 w-5">
                                    <AvatarFallback className="text-[9px] bg-muted text-muted-foreground">
                                      {getInitials(item.data.user?.name || '?')}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="text-xs font-semibold">{item.data.user?.name}</span>
                                  {item.data.workingHours ? (
                                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 gap-1 border-primary/30 text-primary">
                                      <Timer className="h-2.5 w-2.5" />
                                      {item.data.workingHours}h
                                    </Badge>
                                  ) : null}
                                </div>
                                <div className="bg-card border border-border/50 rounded-lg p-2.5 text-sm whitespace-pre-wrap">
                                  {item.data.content}
                                </div>
                              </div>
                            ) : (
                              <p className="text-xs mt-1 leading-relaxed">
                                {getActivityDescription(item.data)}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                      <div ref={commentsEndRef} />
                    </div>
                  )}
                </div>

                <Separator />

                {/* Comment Input — Timesheet Entry */}
                <div className="space-y-2 mb-2 ml-1">
                  <div className="flex gap-2">
                    <div className="w-20 shrink-0">
                      <label className="text-[11px] text-muted-foreground mb-1 flex items-center gap-1">
                        <Timer className="h-3 w-3" /> Hrs
                      </label>
                      <Input
                        type="number"
                        min="0"
                        max="24"
                        step="0.25"
                        value={workingHours}
                        onChange={(e) => setWorkingHours(e.target.value)}
                        placeholder="0.0"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-[11px] text-muted-foreground mb-1 block">Work done</label>
                      <Textarea
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="What did you work on?"
                        rows={2}
                        className="resize-none"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleAddComment();
                          }
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      onClick={handleAddComment}
                      disabled={!comment.trim() || sendingComment}
                      size="sm"
                      className="gap-1.5"
                    >
                      <Send className="h-3.5 w-3.5" />
                      Log Work
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex justify-between items-center pt-4 mt-auto border-t border-border/50">
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => setDeleteConfirmOpen(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Task
              </Button>
              <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
            </div>

            {/* Delete Confirmation */}
            <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Task</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete this task? This action cannot be undone and all associated data will be permanently removed.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => { if (taskId) onDelete(taskId); }}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  );
}
