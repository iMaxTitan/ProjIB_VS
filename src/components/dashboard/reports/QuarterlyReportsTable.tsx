import React from 'react';

type Report = {
  quarterly_id: string;
  annual_plan_id: string;
  department_id: string;
  department_name: string;
  quarter: number;
  goal: string;
  expected_result: string;
  status: string;
  process_id: string;
  process_name: string;
  completion_percentage: number;
};

interface Props {
  reports: Report[];
}

export function QuarterlyReportsTable({ reports }: Props) {
  return (
    <table className="min-w-full border">
      <thead>
        <tr>
          <th>Квартал</th>
          <th>Отдел</th>
          <th>Цель</th>
          <th>Ожидаемый результат</th>
          <th>Статус</th>
          <th>Процесс</th>
          <th>% выполнения</th>
        </tr>
      </thead>
      <tbody>
        {reports.map((r) => (
          <tr key={r.quarterly_id}>
            <td>{r.quarter}</td>
            <td>{r.department_name}</td>
            <td>{r.goal}</td>
            <td>{r.expected_result}</td>
            <td>{r.status}</td>
            <td>{r.process_name || '-'}</td>
            <td>{r.completion_percentage}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
