import React from 'react';
import { Task, Agent } from '../types';
import { motion } from 'framer-motion';
import { Play, Pause, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface KanbanBoardProps {
  tasks: Task[];
  agents: Agent[];
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void;
}

const COLUMNS = [
  { id: 'todo', title: 'To Do', icon: Clock },
  { id: 'in-progress', title: 'In Progress', icon: Play },
  { id: 'review', title: 'Review', icon: AlertCircle },
  { id: 'done', title: 'Done', icon: CheckCircle2 },
] as const;

export function KanbanBoard({ tasks, agents, onUpdateTask }: KanbanBoardProps) {
  return (
    <div className="flex-1 h-full bg-[#0a0a0a] p-6 overflow-x-auto">
      <div className="flex gap-6 h-full min-w-max">
        {COLUMNS.map(col => {
          const columnTasks = tasks.filter(t => t.status === col.id);
          const Icon = col.icon;
          
          return (
            <div key={col.id} className="w-80 flex flex-col h-full bg-white/5 border border-white/10 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-white/10 bg-black/20 flex items-center justify-between">
                <h3 className="font-semibold flex items-center gap-2 text-white/80">
                  <Icon className="w-4 h-4" />
                  {col.title}
                </h3>
                <span className="text-xs font-mono bg-white/10 px-2 py-1 rounded text-white/50">
                  {columnTasks.length}
                </span>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {columnTasks.map(task => {
                  const assignedAgent = agents.find(a => a.id === task.assignedTo);
                  
                  return (
                    <motion.div 
                      layoutId={task.id}
                      key={task.id}
                      className="bg-black/40 border border-white/10 p-4 rounded-lg hover:border-white/20 transition-colors group"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <span className={cn(
                          "text-[10px] uppercase tracking-wider px-2 py-0.5 rounded font-bold",
                          task.priority === 'critical' ? "bg-red-500/20 text-red-400" :
                          task.priority === 'high' ? "bg-orange-500/20 text-orange-400" :
                          task.priority === 'medium' ? "bg-yellow-500/20 text-yellow-400" :
                          "bg-blue-500/20 text-blue-400"
                        )}>
                          {task.priority}
                        </span>
                        
                        {/* Status Actions */}
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                          {task.status !== 'todo' && (
                            <button onClick={() => onUpdateTask(task.id, { status: 'todo' })} className="p-1 hover:bg-white/10 rounded text-white/50 hover:text-white" title="Move to To Do">
                              <Clock className="w-3 h-3" />
                            </button>
                          )}
                          {task.status !== 'in-progress' && (
                            <button onClick={() => onUpdateTask(task.id, { status: 'in-progress' })} className="p-1 hover:bg-white/10 rounded text-white/50 hover:text-white" title="Move to In Progress">
                              <Play className="w-3 h-3" />
                            </button>
                          )}
                          {task.status !== 'review' && (
                            <button onClick={() => onUpdateTask(task.id, { status: 'review' })} className="p-1 hover:bg-white/10 rounded text-white/50 hover:text-white" title="Move to Review">
                              <AlertCircle className="w-3 h-3" />
                            </button>
                          )}
                          {task.status !== 'done' && (
                            <button onClick={() => onUpdateTask(task.id, { status: 'done', progress: 100 })} className="p-1 hover:bg-white/10 rounded text-white/50 hover:text-white" title="Move to Done">
                              <CheckCircle2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                      
                      <h4 className="text-sm font-semibold text-white/90 mb-1">{task.title}</h4>
                      <p className="text-xs text-white/50 mb-4 line-clamp-2">{task.description}</p>
                      
                      <div className="mb-4">
                        <div className="flex justify-between text-[10px] text-white/40 mb-1 font-mono">
                          <span>Progress</span>
                          <span>{Math.round(task.progress)}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full transition-all duration-500",
                              task.status === 'done' ? 'bg-green-500' : task.status === 'review' ? 'bg-yellow-500' : 'bg-blue-500'
                            )}
                            style={{ width: `${task.progress}%` }}
                          />
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between pt-3 border-t border-white/10 gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[10px] uppercase tracking-wider text-white/40">Owner</span>
                          <select 
                            value={task.assignedTo || ''} 
                            onChange={(e) => onUpdateTask(task.id, { assignedTo: e.target.value || null })}
                            className="bg-transparent text-xs text-white/70 border border-white/10 rounded px-2 py-1 outline-none focus:border-blue-500 max-w-[150px] truncate"
                          >
                            <option value="" className="bg-black text-white/50">Unassigned</option>
                            {agents.map(a => (
                              <option key={a.id} value={a.id} className="bg-black text-white">{a.name}</option>
                            ))}
                          </select>
                        </div>

                        {assignedAgent && (
                          <div className={cn(
                            "w-2 h-2 rounded-full",
                            assignedAgent.status === 'working' ? "bg-blue-500" :
                            assignedAgent.status === 'idle' ? "bg-gray-500" :
                            assignedAgent.status === 'error' ? "bg-red-500" : "bg-yellow-500"
                          )} title={`Agent is ${assignedAgent.status}`} />
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
