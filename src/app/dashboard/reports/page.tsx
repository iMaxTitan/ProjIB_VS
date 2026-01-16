import { getQuarterlyReports } from '@/lib/services/report-service';
import { QuarterlyReportsTable } from '@/components/dashboard/reports/QuarterlyReportsTable';

export default async function ReportsPage() {
  const reports = await getQuarterlyReports();
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Отчетность по квартальным планам</h1>
      <QuarterlyReportsTable reports={reports} />
    </div>
  );
}
