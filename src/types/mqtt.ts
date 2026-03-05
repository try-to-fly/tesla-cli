export type VehicleState =
  | 'online'
  | 'asleep'
  | 'charging'
  | 'driving'
  | 'suspended'
  | 'offline'
  | 'updating';

export type ChargingState =
  | 'Charging'
  | 'Complete'
  | 'Disconnected'
  | 'NoPower'
  | 'Stopped'
  | 'Starting';

export interface ParkingSnapshot {
  timestamp: number;
  rated_range_km: number | null;
  usable_battery_level: number | null;
}

export interface StateTracker {
  vehicleState: VehicleState | null;
  chargingState: ChargingState | null;
  lastDriveTrigger: number;
  lastChargeTrigger: number;
  updateAvailable: boolean;
  updateVersion: string | null;
  lastUpdateNotifyTime: number;
  lastParkStart: ParkingSnapshot | null;
  lastParkNotifyTime: number;
  lastChargeStart: ParkingSnapshot | null;

  // Location-aware "park recommendation" push control
  lastParkRecommendCenter: { latitude: number; longitude: number } | null;
  lastParkRecommendTime: number;

  // Navigation push (active_route)
  lastNavDestination: string | null;
  // Last rounded minutes_to_arrival seen (for threshold-crossing detection).
  lastNavMinutes: number | null;
  // Threshold-based pushes for the current destination.
  lastNavThresholdNotifiedMinutes: number[];
  // Arrival message sent for the current destination.
  lastNavArrivedNotified: boolean;
}

export interface PersistedMqttState {
  vehicleState: VehicleState | null;
  chargingState: ChargingState | null;
  lastDriveTrigger: number;
  lastChargeTrigger: number;
  updateAvailable: boolean;
  updateVersion: string | null;
  lastUpdateNotifyTime: number;
  lastParkStart: ParkingSnapshot | null;
  lastParkNotifyTime: number;
  lastChargeStart: ParkingSnapshot | null;

  lastParkRecommendCenter: { latitude: number; longitude: number } | null;
  lastParkRecommendTime: number;

  // Navigation push (active_route)
  lastNavDestination?: string | null;
  lastNavMinutes?: number | null;
  lastNavThresholdNotifiedMinutes?: number[];
  lastNavArrivedNotified?: boolean;

  lastUpdated: number;
}