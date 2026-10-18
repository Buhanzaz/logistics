import { Settings, ExternalLink, Info } from 'lucide-react';
import { Button, Modal } from '../../components/ui';
import type { Warehouse, PlanningSettings } from '../../domain/types';
import type { MapDisplaySettings } from '../../api/map-settings';

interface SettingsDialogProps {
  warehouse?: Warehouse | null;
  mapSettings?: MapDisplaySettings | null;
  onClose: () => void;
  onOpenWarehouseSettings?: () => void;
}

function SettingsRow({ label, value, hint }: { label: string; value: string; hint?: string | undefined }) {
  return (
    <div className="detail-item">
      <small>{label}</small>
      <strong>{value}</strong>
      {hint ? <span>{hint}</span> : null}
    </div>
  );
}

function PlanningSettingsView({ settings }: { settings: PlanningSettings }) {
  const rows: Array<[string, string, string?]> = [
    ['Вместимость (vehicle_capacity)', String(settings.vehicle_capacity), 'макс. бытовок в машине'],
    ['Макс. крюк (max_detour_minutes)', `${settings.max_detour_minutes} мин`, 'допустимый крюк маршрута'],
    ['Коэф. крюка (max_detour_ratio)', String(settings.max_detour_ratio), 'отношение к прямому пути'],
    ['Соседей (max_candidate_neighbors)', String(settings.max_candidate_neighbors), 'кандидатов для вставки'],
    ['Погрузка (default_load_minutes)', `${settings.default_load_minutes} мин`, ''],
    ['Разгрузка (default_unload_minutes)', `${settings.default_unload_minutes} мин`, ''],
    ['Скорость город/регион', `${settings.city_speed_kmh}/${settings.region_speed_kmh} км/ч`, ''],
    ['Оптимизация (max_optimization_seconds)', `${settings.max_optimization_seconds} c`, ''],
    ['Итераций (max_local_search_iterations)', String(settings.max_local_search_iterations), ''],
    ['Мягкая переработка', settings.allow_soft_overtime ? `да, до ${settings.soft_overtime_limit_minutes} мин` : 'нет', ''],
  ];
  return (
    <div className="detail-grid">
      {rows.map(([label, value, hint]) => (
        <SettingsRow key={label} label={label} value={value} hint={hint} />
      ))}
    </div>
  );
}

export function SettingsDialog({ warehouse, mapSettings, onClose, onOpenWarehouseSettings }: SettingsDialogProps) {
  return (
    <Modal title="Настройки" description="Управление параметрами логистики" onClose={onClose} wide>
      <div className="settings-dialog">
        <div className="settings-dialog__notice" role="note">
          <Info size={16} aria-hidden="true" />
          <div>
            <strong>Настройки крюка и тарифов перенесены</strong>
            <p>Детальное управление крюком, тарифами доставки и политиками зон теперь выполняется во внешнем проекте. Здесь — только просмотр текущих параметров склада и карты.</p>
          </div>
        </div>

        {warehouse ? (
          <>
            <section className="settings-dialog__section" aria-labelledby="settings-warehouse-title">
              <h3 id="settings-warehouse-title">Склад: {warehouse.name}</h3>
              <div className="detail-grid">
                <SettingsRow label="Рабочий день" value={`${warehouse.working_day_start} – ${warehouse.working_day_end}`} />
                <SettingsRow label="Погрузка / разгрузка / оборот" value={`${warehouse.loading_minutes} / ${warehouse.unloading_minutes} / ${warehouse.turnaround_minutes} мин`} />
                <SettingsRow label="Часовой пояс" value={warehouse.timezone} />
                <SettingsRow label="Координаты" value={`${warehouse.latitude.toFixed(4)}, ${warehouse.longitude.toFixed(4)}`} />
              </div>
              <div className="toolbar-row" style={{ marginTop: 12 }}>
                {onOpenWarehouseSettings ? (
                  <Button variant="primary" onClick={() => { onClose(); onOpenWarehouseSettings(); }}>
                    <Settings size={14} /> Настроить склад
                  </Button>
                ) : null}
              </div>
            </section>

            <section className="settings-dialog__section" aria-labelledby="settings-planning-title">
              <h3 id="settings-planning-title">Планировщик</h3>
              <PlanningSettingsView settings={warehouse.settings} />
              {warehouse.isochrone_tariffs?.length ? (
                <div style={{ marginTop: 12 }}>
                  <h4 style={{ fontSize: 13, margin: '8px 0' }}>Тарифы изохрон</h4>
                  <div className="detail-grid">
                    {warehouse.isochrone_tariffs.map((tariff, idx) => (
                      <SettingsRow
                        key={idx}
                        label={`До ${tariff.travel_minutes} мин`}
                        value={`${tariff.price_rubles.toLocaleString('ru-RU')} ₽`}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          </>
        ) : (
          <div className="empty-state">
            <strong>Склад не выбран</strong>
            <p>Выберите склад, чтобы увидеть его текущие настройки планировщика.</p>
          </div>
        )}

        <section className="settings-dialog__section" aria-labelledby="settings-map-title">
          <h3 id="settings-map-title">Карта</h3>
          {mapSettings ? (
            <div className="detail-grid">
              <SettingsRow label="Провайдер" value={mapSettings.provider} />
              <SettingsRow label="Версия" value={String(mapSettings.version)} />
              {mapSettings.provider === 'YANDEX' ? (
                <SettingsRow label="Yandex API key" value={mapSettings.yandex_api_key ? '••••' + mapSettings.yandex_api_key.slice(-4) : '—'} hint="ключ скрыт" />
              ) : null}
            </div>
          ) : (
            <p className="field__hint">Настройки карты загружаются отдельно. Откройте карту, чтобы увидеть провайдера.</p>
          )}
        </section>

        <section className="settings-dialog__section settings-dialog__external">
          <h3>Внешний проект настроек</h3>
          <p className="field__hint">
            Для изменения крюка, тарифов и зон используйте внешний сервис управления. После сохранения изменения применятся при следующем построении плана.
          </p>
          <Button variant="ghost" onClick={() => window.open('https://github.com/Buhanzaz/logistics', '_blank')}>
            <ExternalLink size={14} /> Открыть внешний проект
          </Button>
        </section>
      </div>
    </Modal>
  );
}
