"""Warehouse helpers without authentication – all warehouses are accessible."""

from __future__ import annotations

from collections.abc import Iterable
from datetime import date
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError, not_found
from app.integrations.rwms import RwmsPlanningClient
from app.models import (
    LogisticsEvent,
    LogisticsHumanAction,
    LogisticsNotice,
    RecoveryProposal)
from app.models.domain import (
    Driver,
    DriverShift,
    LogisticsRequest,
    OptimizationRun,
    RequestDateOption,
    RoutePlan,
    SlotDayPlan,
    SlotHold,
    Trailer,
    Vehicle,
    Warehouse)
from app.services.planning_group import resolve_planning_warehouse_group


def require_external_warehouse_access(*args, **kwargs) -> None:
    return None


async def require_local_warehouse_access(
    session: AsyncSession,
    warehouse_id: UUID,
    level=None) -> Warehouse:
    warehouse = await session.get(Warehouse, warehouse_id)
    if warehouse is None:
        raise not_found("warehouse", warehouse_id)
    return warehouse


async def require_owned_entity_access(
    session: AsyncSession,
    entity_type: type,
    entity_id: UUID,
    resource: str,
    level=None) -> object:
    entity = await session.get(entity_type, entity_id)  # type: ignore
    if entity is None:
        raise not_found(resource, entity_id)  # type: ignore
    return entity  # type: ignore


async def require_request_date_option_access(
    session: AsyncSession,
    option_id: UUID,
    level=None) -> RequestDateOption:
    option = await session.get(RequestDateOption, option_id)
    if option is None:
        raise not_found("request_date_option", option_id)
    return option


async def require_plan_access(
    session: AsyncSession,
    plan_id: UUID,
    level=None) -> RoutePlan:
    plan = await session.get(RoutePlan, plan_id)
    if plan is None:
        raise not_found("route_plan", plan_id)
    return plan


async def require_dynamic_day_access(
    session: AsyncSession,
    warehouse_id: UUID,
    planning_date: date,
    level=None,
    rwms_client: RwmsPlanningClient | None = None) -> Warehouse:
    selected = await session.get(Warehouse, warehouse_id)
    if selected is None:
        raise not_found("warehouse", warehouse_id)
    group = await resolve_planning_warehouse_group(
        session,
        rwms_client,
        selected,
        planning_date=planning_date)
    if group.root.id != warehouse_id:
        raise ApiError(
            422,
            "PLANNING_ROOT_REQUIRED",
            "Операции группового дня выполняются через основной склад.",
            extra={"planning_root_warehouse_id": str(group.root.id)})
    return selected


async def require_optimization_run_access(
    session: AsyncSession,
    run_id: UUID,
    level=None) -> OptimizationRun:
    run = await session.get(OptimizationRun, run_id)
    if run is None:
        raise not_found("optimization_run", run_id)
    return run


async def require_slot_hold_access(
    session: AsyncSession,
    hold_id: UUID,
    level=None) -> SlotHold:
    hold = await session.get(SlotHold, hold_id)
    if hold is None:
        raise not_found("slot_hold", hold_id)
    day_plan = await session.get(SlotDayPlan, hold.day_plan_id)
    if day_plan is None:
        raise not_found("slot_day_plan", hold.day_plan_id)
    return hold


async def require_local_warehouse_set_access(
    session: AsyncSession,
    warehouse_ids: Iterable[UUID],
    level=None) -> None:
    unique_ids = set(warehouse_ids) if warehouse_ids else set()
    if not unique_ids:
        return None
    warehouses = list(
        await session.scalars(select(Warehouse).where(Warehouse.id.in_(unique_ids)))
    )
    if len(warehouses) != len(unique_ids):
        missing = unique_ids.difference(item.id for item in warehouses)
        raise not_found("warehouse", next(iter(missing)))
    return None


def filter_authorized_warehouses(
    warehouses: Iterable[Warehouse],
    level=None) -> list[Warehouse]:
    return list(warehouses)
