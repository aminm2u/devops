import React, { useState } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { MultiSelect, Option } from '@/components/ui/multi-select';
import { Calendar, Plus, Trash2 } from 'lucide-react';
import apiClient from '@/api/client';
import toast from 'react-hot-toast';
import { TaskDetailModal } from './TaskDetailModal';

export function KanbanTab({ project, refetch }: { project: any, refetch: () => void }) {
  const [columns, setColumns] = useState(project.taskColumns || []);
  const [tasks, setTasks] = useState(project.tasks || []);

  React.useEffect(() => {
    setColumns(project?.taskColumns || []);
    setTasks(project?.tasks || []);
  }, [project?.taskColumns, project?.tasks]);

  const [colDialogOpen, setColDialogOpen] = useState(false);
  const [newColName, setNewColName] = useState('');

  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [activeColId, setActiveColId] = useState<number | null>(null);

  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [taskDetailOpen, setTaskDetailOpen] = useState(false);

  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    assignees: [] as number[],
    priority: 'medium',
    dueDate: ''
  });

  // Build assignee options from team members
  const assigneeOptions: Option[] = (project.teamAssignments || []).map((m: any) => ({
    label: m.user.name,
    value: String(m.userId),
  }));

  const onDragEnd = async (result: any) => {
    if (!result.destination) return;

    const destColId = parseInt(result.destination.droppableId);
    const taskId = parseInt(result.draggableId);

    const newTasks = Array.from(tasks);
    const taskIndex = newTasks.findIndex((t: any) => t.id === taskId);
    const [movedTask] = newTasks.splice(taskIndex, 1);
    movedTask.columnId = destColId;

    const destTasks = newTasks.filter((t: any) => t.columnId === destColId);
    destTasks.splice(result.destination.index, 0, movedTask);

    const reorderedDestTasks = destTasks.map((t: any, index: number) => ({ ...t, position: index }));
    const finalTasks = newTasks.filter((t: any) => t.columnId !== destColId).concat(reorderedDestTasks);

    setTasks(finalTasks as any);

    try {
      await apiClient.put('/tasks/reorder', {
        tasks: reorderedDestTasks.map((t: any) => ({
          id: t.id,
          columnId: t.columnId,
          position: t.position
        }))
      });
      toast.success('Task moved');
      refetch();
    } catch (err) {
      toast.error('Failed to move task');
      refetch();
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

  const getAssigneeName = (id: number) => {
    const member = project.teamAssignments?.find((m: any) => m.userId === id);
    return member ? member.user.name : 'Unknown';
  };

  const handleAddColumn = async () => {
    if (!newColName) return;
    try {
      await apiClient.post('/tasks/columns', { projectId: project.id, name: newColName });
      toast.success('Board added');
      setColDialogOpen(false);
      setNewColName('');
      refetch();
    } catch (err) {
      toast.error('Failed to add board');
    }
  };

  const handleAddTask = async () => {
    if (!taskForm.title) return;
    try {
      await apiClient.post('/tasks', {
        projectId: project.id,
        columnId: activeColId,
        ...taskForm,
        assignees: taskForm.assignees.map(Number),
        dueDate: taskForm.dueDate ? new Date(taskForm.dueDate).toISOString() : null
      });
      toast.success('Task added');
      setTaskDialogOpen(false);
      setTaskForm({ title: '', description: '', assignees: [], priority: 'medium', dueDate: '' });
      refetch();
    } catch (err) {
      toast.error('Failed to add task');
    }
  };

  const handleDeleteTask = async (taskId: number) => {
    try {
      await apiClient.delete(`/tasks/${taskId}`);
      toast.success('Task deleted');
      setTaskDetailOpen(false);
      setSelectedTaskId(null);
      refetch();
    } catch (err) {
      toast.error('Failed to delete task');
    }
  };

  const openTaskDetail = (taskId: number, e: React.MouseEvent) => {
    e.stopPropagation(); // prevent drag
    setSelectedTaskId(taskId);
    setTaskDetailOpen(true);
  };

  return (
    <div className="h-full">
      <div className="flex justify-between mb-4">
        <h2 className="text-xl font-bold">Project Board</h2>
        <Button onClick={() => setColDialogOpen(true)} variant="outline">
          <Plus className="w-4 h-4 mr-2" /> Add Board
        </Button>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4 h-[600px] items-start">
          {columns.map((col: any) => {
            const colTasks = tasks.filter((t: any) => t.columnId === col.id).sort((a: any, b: any) => a.position - b.position);

            return (
              <div key={col.id} className="min-w-[300px] w-[300px] flex flex-col bg-muted/50 p-3 rounded-xl">
                <h3 className="font-semibold mb-3 flex items-center justify-between text-sm px-1">
                  {col.name}
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">{colTasks.length}</Badge>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setActiveColId(col.id); setTaskDialogOpen(true); }}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </h3>

                <Droppable droppableId={String(col.id)}>
                  {(provided) => (
                    <div
                      {...provided.droppableProps}
                      ref={provided.innerRef}
                      className="flex-1 space-y-2.5 min-h-[150px]"
                    >
                      {colTasks.map((task: any, index: number) => (
                        <Draggable key={task.id} draggableId={String(task.id)} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              style={{
                                ...provided.draggableProps.style,
                                opacity: snapshot.isDragging ? 0.85 : 1
                              }}
                            >
                              <Card
                                className="shadow-sm hover:shadow-md transition-all cursor-grab active:cursor-grabbing group"
                                onClick={(e) => openTaskDetail(task.id, e)}
                              >
                                <CardContent className="p-3">
                                  <div className="flex justify-between items-start mb-1.5 gap-2">
                                    <h4 className="font-medium text-sm leading-tight">{task.title}</h4>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive/80 shrink-0"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteTask(task.id);
                                      }}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                  {task.description && (
                                    <p className="text-xs text-muted-foreground mb-2.5 line-clamp-2">{task.description}</p>
                                  )}

                                  <div className="flex items-center justify-between mt-2 flex-wrap gap-1">
                                    <div className="flex flex-wrap gap-1">
                                      {(task.assignees || []).slice(0, 3).map((id: number) => (
                                        <span key={id} className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                          {getAssigneeName(id)}
                                        </span>
                                      ))}
                                      {(task.assignees || []).length > 3 && (
                                        <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                          +{(task.assignees || []).length - 3}
                                        </span>
                                      )}
                                      {(!task.assignees || task.assignees.length === 0) && (
                                        <span className="text-[10px] font-medium text-muted-foreground/60 bg-muted/50 border border-border/50 px-1.5 py-0.5 rounded">
                                          Unassigned
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  <div className="flex items-center justify-between mt-2.5">
                                    <Badge className={`text-[10px] px-1.5 py-0 border ${getPriorityColor(task.priority)}`} variant="outline">
                                      {task.priority}
                                    </Badge>

                                    {task.dueDate && (
                                      <div className="flex items-center text-xs text-muted-foreground">
                                        <Calendar className="w-3 h-3 mr-1" />
                                        {new Date(task.dueDate).toLocaleDateString()}
                                      </div>
                                    )}
                                  </div>
                                </CardContent>
                              </Card>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>

      {/* Add Board Dialog */}
      <Dialog open={colDialogOpen} onOpenChange={setColDialogOpen}>
        <DialogContent className="p-0">
          <Card className="pt-8 border-0 shadow-none">
            <CardHeader>
              <CardTitle>Add New Board</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Board Name</Label>
                  <Input value={newColName} onChange={e => setNewColName(e.target.value)} placeholder="e.g. Backlog, Testing" />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <Button variant="outline" onClick={() => setColDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleAddColumn}>Save</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </DialogContent>
      </Dialog>

      {/* Add Task Dialog */}
      <Dialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen}>
        <DialogContent className="p-0">
          <Card className="pt-8 border-0 shadow-none">
            <CardHeader>
              <CardTitle>Add New Task</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Task Title</Label>
                  <Input value={taskForm.title} onChange={e => setTaskForm({...taskForm, title: e.target.value})} placeholder="What needs to be done?" />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea value={taskForm.description} onChange={e => setTaskForm({...taskForm, description: e.target.value})} placeholder="Add details..." />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Assignees</Label>
                    <MultiSelect
                      options={assigneeOptions}
                      selected={taskForm.assignees.map(String)}
                      onChange={(vals) => setTaskForm({ ...taskForm, assignees: vals.map(Number) })}
                      placeholder="Select team members..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Priority</Label>
                    <Select value={taskForm.priority} onValueChange={v => setTaskForm({...taskForm, priority: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Due Date</Label>
                  <Input type="date" value={taskForm.dueDate} onChange={e => setTaskForm({...taskForm, dueDate: e.target.value})} />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <Button variant="outline" onClick={() => setTaskDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleAddTask}>Create Task</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </DialogContent>
      </Dialog>

      {/* Task Detail Modal */}
      <TaskDetailModal
        taskId={selectedTaskId}
        open={taskDetailOpen}
        onClose={() => { setTaskDetailOpen(false); setSelectedTaskId(null); }}
        onDelete={handleDeleteTask}
        members={project.teamAssignments || []}
      />
    </div>
  );
}
