import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import { ReportsNav } from './Reports';
import { weekKey, rangeLabel, grid, MUTED, SELECT, ROW, TOTAL_ROW, Table, EmptyRow, WeekRangePicker, riderTotals, RiderCells } from '../../components/ReportBits';

// KAN-47: one row per rider across all route owners for a range of weeks: runs, delivered %, on-time %, average run time
// and complaints (withdrawn left out), with a total row. The server sends the runs and complaints; the totals are worked
// out here, so the owner, region, city and rider filters, the rows and the total always agree (as in KAN-43).
// ?from=2026-40&to=2026-47 keeps the weeks in the address.

const COLUMNS = [['Rider', '1.5fr'], ['Route owner', '1.4fr'], ['Runs', '0.6fr'], ['Delivered', '0.8fr'], ['On time', '0.7fr'],
  ['Avg run time', '0.9fr'], ['Complaints', '0.8fr']];

export default function RiderPerformanceReport() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [regionId, setRegionId] = useState('');
  const [cityId, setCityId] = useState('');
  const [riderId, setRiderId] = useState('');
  const from = params.get('from'), to = params.get('to');

  useEffect(() => {
    setLoading(true); setError('');
    api.getRiderPerformance({ from, to }).then(setData).catch(e => setError(e?.error || 'Could not load the report')).finally(() => setLoading(false));
  }, [from, to]);

  const setRange = (key, value) => {
    const next = new URLSearchParams(params);
    next.set('from', key === 'from' ? value : weekKey(data.from));
    next.set('to', key === 'to' ? value : weekKey(data.to));
    setParams(next);
  };

  const runs = data?.runs || [], complaints = data?.complaints || [];
  const regions = [...new Map([...runs, ...complaints].filter(r => r.region_id && r.region_name).map(r => [r.region_id, r.region_name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const cities = [...new Map([...runs, ...complaints].filter(r => r.city_id && r.city_name && (!regionId || r.region_id === Number(regionId))).map(r => [r.city_id, r.city_name])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1]));
  const areaFiltered = !!(regionId || cityId);
  const keep = r => (!regionId || r.region_id === Number(regionId)) && (!cityId || r.city_id === Number(cityId)) && (!ownerId || r.owner_id === Number(ownerId));

  // every rider shows, even with no runs (zeros); a rider since deleted shows when they have runs (name from the run)
  const riders = new Map((data?.riders || []).map(r => [r.id, { name: r.name, owner_id: r.owner_id, owner_name: r.owner_name }]));
  runs.forEach(r => { if (!riders.has(r.rider_id)) riders.set(r.rider_id, { name: r.rider_name, owner_id: r.owner_id, owner_name: r.owner_name }); });
  const rows = [...riders.entries()]
    .map(([id, r]) => {
      const rr = runs.filter(x => x.rider_id === id && keep(x)), cc = complaints.filter(x => x.rider_id === id && keep(x));
      return { id, ...r, runs: rr, t: riderTotals(rr, cc), active: rr.length + cc.length > 0 };
    })
    .filter(r => (areaFiltered ? r.active : true) && (!ownerId || r.owner_id === Number(ownerId) || r.active))
    .sort((a, b) => a.name.localeCompare(b.name));
  const shown = rows.filter(r => !riderId || r.id === Number(riderId));
  const grand = riderTotals(runs.filter(r => keep(r) && shown.some(s => s.id === r.rider_id)),
                            complaints.filter(c => keep(c) && shown.some(s => s.id === c.rider_id)));

  return (
    <div className="screen">
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate('/admin/reports')}><i className="ti ti-arrow-left" /></button>
        <h3>Rider performance</h3>
        <div style={{ width:30 }} />
      </div>

      <div style={{ padding:'0 22px 20px' }}>
        <ReportsNav />

        {data?.from && (
          <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:14 }}>
            <WeekRangePicker weeks={data.weeks} from={data.from} to={data.to} onChange={setRange} />
            <select className="input" aria-label="Route owner" style={{ ...SELECT, flex:'1 1 180px', maxWidth:260 }} value={ownerId}
              onChange={e => { setOwnerId(e.target.value); setRiderId(''); }}>
              <option value="">All route owners</option>
              {data.owners.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <select className="input" aria-label="Region" style={{ ...SELECT, flex:'1 1 150px', maxWidth:220 }} value={regionId}
              onChange={e => { setRegionId(e.target.value); setCityId(''); }}>
              <option value="">All regions</option>
              {regions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
            <select className="input" aria-label="City" style={{ ...SELECT, flex:'1 1 150px', maxWidth:220 }} value={cityId} onChange={e => setCityId(e.target.value)}>
              <option value="">All cities</option>
              {cities.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
            <select className="input" aria-label="Rider" style={{ ...SELECT, flex:'1 1 180px', maxWidth:260 }} value={riderId} onChange={e => setRiderId(e.target.value)}>
              <option value="">All riders</option>
              {rows.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
        )}

        {loading && <div className="spinner" />}
        {error && <div style={{ color:'var(--red)', fontSize:13, marginBottom:12 }}><i className="ti ti-alert-triangle" /> {error}</div>}

        {!loading && !error && data && (
          <>
            <div className="section-label">
              {shown.length} {shown.length === 1 ? 'rider' : 'riders'}{data.from ? ` · ${rangeLabel(data.from, data.to)}` : ''}
            </div>
            <Table columns={COLUMNS} minWidth={760}>
              {shown.map(r => (
                <div key={r.id} data-testid="rider-row" style={{ ...grid(COLUMNS), ...ROW }}>
                  <span style={{ fontWeight:600 }}>{r.name}</span>
                  <span style={r.owner_name ? null : MUTED}>{r.owner_name || '—'}</span>
                  <RiderCells t={r.t} />
                </div>
              ))}
              {shown.length === 0 && <EmptyRow>{riders.size ? 'No riders match these filters' : 'No riders yet'}</EmptyRow>}
              {shown.length > 0 && (
                <div data-testid="total-row" style={{ ...grid(COLUMNS), ...TOTAL_ROW }}>
                  <span>Total</span><span />
                  <RiderCells t={grand} />
                </div>
              )}
            </Table>
            <div style={{ ...MUTED, fontSize:11, marginTop:8 }}>
              Runs = routes the rider started (the last attempt in a week). Delivered = stops delivered of all stops on those runs.
              On time = delivered inside the Tue 18:00 – Thu 23:00 window. Avg run time = start to finish of the runs the rider
              finished themselves. Withdrawn complaints are not counted.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
