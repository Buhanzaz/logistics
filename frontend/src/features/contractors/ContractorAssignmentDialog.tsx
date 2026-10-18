import { UserRoundCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, Modal, SelectField, Spinner } from '../../components/ui';
import type { LogisticsRequest, UUID } from '../../domain/types';
import { userFacingErrorDetail } from '../../utils/user-facing-error';
import { listContractorDrivers, type ContractorDriver } from './contractor-client';

/** Confirms a direct task handoff without creating an internal route or vehicle cycle. */
export function ContractorAssignmentDialog({ request, warehouseId, busy, onClose, onAssign }: {
  request: LogisticsRequest;
  warehouseId: UUID;
  busy: boolean;
  onClose: () => void;
  onAssign: (contractorWorkerId: UUID) => Promise<void>;
}) {
  const [contractors, setContractors] = useState<ContractorDriver[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(null);
    void listContractorDrivers(warehouseId).then((items) => {
      if (!current) return;
      setContractors(items);
    }).catch((caught: unknown) => { if (current) setError(userFacingErrorDetail(caught)); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [warehouseId]);

  const active = useMemo(() => contractors.filter((contractor) => contractor.active), [contractors]);
  useEffect(() => {
    setSelectedId((current) => active.some((contractor) => contractor.workerId === current)
      ? current
      : active[0]?.workerId ?? '');
  }, [active]);
  const selected = active.find((contractor) => contractor.workerId === selectedId) ?? null;
  return (
    <Modal title="Передать наёмному водителю" description={`${request.name} · ${request.quantity} бытовк.`} onClose={onClose}>
      {loading ? <Spinner label="Загружаем доступных подрядчиков…" /> : null}
      {!loading ? (
        <div className="contractor-assignment">
          {error ? <div className="error-panel" role="alert"><strong>Не удалось получить список</strong><p>{error}</p></div> : null}
          {active.length ? <>
            <SelectField label="Наёмный водитель" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
              {active.map((contractor) => <option key={contractor.workerId} value={contractor.workerId}>{contractor.displayName} · {contractor.phone}</option>)}
            </SelectField>
            {selected ? <div className="detail-item"><small>Контакт</small><strong>{selected.phone}</strong><span>{selected.comment || 'Без комментария'}</span></div> : null}
            <p className="field__hint">Задание будет передано напрямую. RWMS не будет строить для этого водителя внутренние циклы и не потребует машину.</p>
            <div className="toolbar-row contractor-editor__actions"><Button onClick={onClose}>Отмена</Button><Button variant="primary" disabled={busy || !selectedId} onClick={() => void onAssign(selectedId)}>{busy ? 'Передаём…' : 'Подтвердить передачу'}</Button></div>
          </> : <EmptyState icon={<UserRoundCheck />} title="Нет активных наёмных водителей" description="Добавьте или активируйте подрядчика в разделе «Наёмные водители»." />}
        </div>
      ) : null}
    </Modal>
  );
}
