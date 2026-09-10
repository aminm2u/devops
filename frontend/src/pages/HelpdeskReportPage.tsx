import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import apiClient from "@/api/client";
import {
  Calendar,
  Download,
  TrendingUp,
  Clock,
  AlertTriangle,
  CheckCircle,
  BarChart3,
  PieChart,
  Users,
  Star,
  FileText,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function HelpdeskReportPage() {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());

  const { data: reportData, isLoading } = useQuery({
    queryKey: ["helpdesk-report", selectedMonth, selectedYear],
    queryFn: async () => {
      const res = await apiClient.get("/helpdesk/reports/monthly", {
        params: { month: selectedMonth, year: selectedYear },
      });
      return res.data.data;
    },
  });

  const priorityColor: Record<string, string> = {
    urgent: "text-red-600 bg-red-50",
    high: "text-orange-600 bg-orange-50",
    medium: "text-yellow-600 bg-yellow-50",
    low: "text-blue-600 bg-blue-50",
  };

  const statusColor: Record<string, string> = {
    open: "text-blue-600 bg-blue-50",
    in_progress: "text-purple-600 bg-purple-50",
    awaiting_response: "text-yellow-600 bg-yellow-50",
    resolved: "text-green-600 bg-green-50",
    closed: "text-gray-600 bg-gray-50",
    reopened: "text-red-600 bg-red-50",
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const summary = reportData?.summary || {};
  const byPriority = reportData?.byPriority || {};
  const byCategory = reportData?.byCategory || {};
  const byAssignee = reportData?.byAssignee || {};
  const byDay = reportData?.byDay || {};
  const tickets = reportData?.tickets || [];

  const maxDayCount = Math.max(...Object.values(byDay).map(Number), 1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <BarChart3 className="h-8 w-8" />
            Monthly Report
          </h1>
          <p className="text-muted-foreground mt-1">
            Helpdesk performance and ticket analytics
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(parseInt(v))}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => (
                <SelectItem key={i} value={String(i + 1)}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(parseInt(v))}>
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[2024, 2025, 2026, 2027].map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Created</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{summary.totalCreated || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">tickets this month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Resolved</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{summary.totalResolved || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {summary.totalCreated > 0
                ? Math.round(((summary.totalResolved || 0) / summary.totalCreated) * 100)
                : 0}
              % resolution rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Avg Resolution</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {summary.avgResolutionTime > 60
                ? `${Math.round(summary.avgResolutionTime / 60)}h`
                : `${summary.avgResolutionTime}m`}
            </div>
            <p className="text-xs text-muted-foreground mt-1">average time to resolve</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">SLA Compliance</CardTitle>
            {summary.slaComplianceRate >= 90 ? (
              <TrendingUp className="h-4 w-4 text-green-600" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-red-600" />
            )}
          </CardHeader>
          <CardContent>
            <div
              className={`text-3xl font-bold ${
                summary.slaComplianceRate >= 90 ? "text-green-600" : "text-red-600"
              }`}
            >
              {summary.slaComplianceRate || 100}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {summary.slaBreached || 0} breached
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Priority Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="h-5 w-5" />
              By Priority
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(byPriority).map(([priority, count]) => {
              const total = Object.values(byPriority).reduce((a: number, b) => a + Number(b), 0) as number;
              const pct = total > 0 ? (Number(count) / total) * 100 : 0;
              return (
                <div key={priority} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <Badge variant="outline" className={priorityColor[priority] || ""}>
                      {priority}
                    </Badge>
                    <span className="font-medium">{String(count)} tickets</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        priority === "urgent"
                          ? "bg-red-500"
                          : priority === "high"
                          ? "bg-orange-500"
                          : priority === "medium"
                          ? "bg-yellow-500"
                          : "bg-blue-500"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {Object.keys(byPriority).length === 0 && (
              <p className="text-muted-foreground text-center py-4">No data for this period</p>
            )}
          </CardContent>
        </Card>

        {/* Category Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              By Category
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(byCategory)
              .sort(([, a], [, b]) => Number(b) - Number(a))
              .map(([category, count]) => {
                const maxCount = Math.max(...Object.values(byCategory).map(Number), 1);
                const pct = (Number(count) / maxCount) * 100;
                return (
                  <div key={category} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{category}</span>
                      <span className="text-muted-foreground">{String(count)} tickets</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className="h-2 rounded-full bg-primary"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            {Object.keys(byCategory).length === 0 && (
              <p className="text-muted-foreground text-center py-4">No data for this period</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Daily Trend & Assignee */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Daily Ticket Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {Object.entries(byDay)
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([day, count]) => {
                  const pct = (Number(count) / maxDayCount) * 100;
                  return (
                    <div key={day} className="flex items-center gap-2 text-sm">
                      <span className="w-8 text-muted-foreground">Day {day}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-4 relative">
                        <div
                          className="h-4 rounded-full bg-primary/80 flex items-center justify-end pr-2"
                          style={{ width: `${Math.max(pct, 5)}%` }}
                        >
                          <span className="text-[10px] text-white font-medium">{String(count)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              {Object.keys(byDay).length === 0 && (
                <p className="text-muted-foreground text-center py-4">No data for this period</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* By Assignee */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              By Assignee
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(byAssignee)
              .sort(([, a], [, b]) => Number(b) - Number(a))
              .map(([assignee, count]) => {
                const maxCount = Math.max(...Object.values(byAssignee).map(Number), 1);
                const pct = (Number(count) / maxCount) * 100;
                return (
                  <div key={assignee} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{assignee}</span>
                      <span className="text-muted-foreground">{String(count)} tickets</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className="h-2 rounded-full bg-blue-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            {Object.keys(byAssignee).length === 0 && (
              <p className="text-muted-foreground text-center py-4">No data for this period</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Satisfaction */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5" />
            Customer Satisfaction
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="text-4xl font-bold">{summary.avgSatisfaction || 0}</div>
            <div>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star
                    key={s}
                    className={`h-5 w-5 ${
                      s <= Math.round(summary.avgSatisfaction || 0)
                        ? "fill-yellow-400 text-yellow-400"
                        : "text-gray-300"
                    }`}
                  />
                ))}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Based on {summary.totalRated || 0} ratings
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ticket List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              All Tickets ({tickets.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border max-h-[400px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Assignee</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Resolved</TableHead>
                  <TableHead>Rating</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets.map((ticket: any) => (
                  <TableRow key={ticket.id}>
                    <TableCell className="font-medium max-w-[200px] truncate">
                      {ticket.title}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusColor[ticket.status] || ""}>
                        {ticket.status?.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={priorityColor[ticket.priority] || ""}>
                        {ticket.priority}
                      </Badge>
                    </TableCell>
                    <TableCell>{ticket.category || "-"}</TableCell>
                    <TableCell>{ticket.assignee || "Unassigned"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {ticket.createdAt
                        ? new Date(ticket.createdAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "-"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {ticket.resolvedAt
                        ? new Date(ticket.resolvedAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "-"}
                    </TableCell>
                    <TableCell>
                      {ticket.satisfaction ? (
                        <div className="flex items-center gap-0.5">
                          {Array.from({ length: ticket.satisfaction }).map((_, i) => (
                            <Star key={i} className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                          ))}
                        </div>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {tickets.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No tickets found for this period
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
