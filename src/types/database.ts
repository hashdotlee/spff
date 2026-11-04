export type UserRole = 'user' | 'admin';
export type WarehouseStatus = 'active' | 'reported' | 'hidden';
export type PlaceCategory = 'warehouse' | 'eatery' | 'customer' | 'parking';
export type OrderRatingLevel = 'ngon' | 'tam' | 'khe' | 'mom';
export type VoiceNoteStatus = 'active' | 'hidden';
export type ReportStatus = 'pending' | 'resolved' | 'dismissed';
export type IncidentType =
  | 'broken_vehicle' // Hỏng xe
  | 'out_of_gas'     // Hết xăng / dầu
  | 'flat_tire'      // Thủng lốp / nổ lốp
  | 'battery_dead'   // Hết ắc quy / chết máy
  | 'accident'       // Va chạm / sự cố đường
  | 'other';         // Sự cố khác

export type IncidentStatus = 'open' | 'helping' | 'resolved' | 'cancelled';
export type HelperStatus = 'offered' | 'accepted' | 'completed' | 'cancelled';

export type PostTag = 'ket_xe' | 'chot_gt' | 'canh_bao' | 'tam_su' | 'quan_ngon' | 'khac';
export type PostStatus = 'active' | 'hidden';

export interface Post {
  id: string;
  user_id: string;
  content: string;
  tag: PostTag;
  province: string | null;
  upvotes_count: number;
  downvotes_count: number;
  status: PostStatus;
  created_at: string;
  updated_at: string;
  // Joined / Computed fields
  user?: Profile | null;
  user_vote?: number | null; // 1: upvoted, -1: downvoted, null: not voted
  net_score?: number;
}

export interface PostVote {
  id: string;
  post_id: string;
  user_id: string;
  vote_value: 1 | -1;
  created_at: string;
}

export interface Profile {
  id: string;
  email: string | null;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  role: UserRole;
  is_banned: boolean;
  bank_name: string | null;
  bank_account_no: string | null;
  bank_account_name: string | null;
  reputation_score: number;
  created_at: string;
  updated_at: string;
}

export interface Warehouse {
  id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  description: string | null;
  image_url?: string | null;
  created_by: string | null;
  status: WarehouseStatus;
  category?: PlaceCategory;
  is_private?: boolean;
  created_at: string;
  // Computed / Joined fields
  distance_km?: number;
  voice_notes_count?: number;
  creator?: Profile | null;
  order_prediction?: OrderPredictionResult;
}

export interface VoiceNote {
  id: string;
  warehouse_id: string;
  user_id: string;
  audio_url: string;
  duration_seconds: number;
  note_text: string | null;
  upvotes_count: number;
  downvotes_count: number;
  status: VoiceNoteStatus;
  created_at: string;
  // Joined fields
  user?: Profile | null;
  user_vote?: number | null; // 1: upvoted, -1: downvoted, null: not voted
}

export interface VoiceVote {
  id: string;
  voice_note_id: string;
  user_id: string;
  vote_value: 1 | -1;
  created_at: string;
}

export interface Report {
  id: string;
  reporter_id: string;
  reported_user_id: string | null;
  warehouse_id: string | null;
  voice_note_id: string | null;
  reason: string;
  status: ReportStatus;
  created_at: string;
  // Joined
  reporter?: Profile | null;
  reported_user?: Profile | null;
  warehouse?: Warehouse | null;
  voice_note?: VoiceNote | null;
}

export interface Badge {
  id: string;
  title: string;
  description: string;
  icon_name: string;
  min_points: number;
}

export interface UserBadge {
  id: string;
  user_id: string;
  badge_id: string;
  earned_at: string;
  badge?: Badge;
}

export interface Incident {
  id: string;
  user_id: string;
  title: string;
  incident_type: IncidentType;
  description: string;
  latitude: number;
  longitude: number;
  address: string | null;
  photo_url?: string | null;
  phone: string;
  audio_url?: string | null;
  status: IncidentStatus;
  helper_count: number;
  created_at: string;
  updated_at: string;
  // Computed / Joined fields
  distance_km?: number;
  user?: Profile | null;
  helpers?: IncidentHelper[];
  current_user_helper?: IncidentHelper | null;
}

export interface IncidentHelper {
  id: string;
  incident_id: string;
  helper_id: string;
  status: HelperStatus;
  message: string | null;
  eta_minutes: number | null;
  created_at: string;
  // Joined fields
  helper?: Profile | null;
}

export interface LocationOrderRating {
  id: string;
  warehouse_id?: string | null;
  latitude: number;
  longitude: number;
  address?: string | null;
  user_id: string | null;
  rating: OrderRatingLevel;
  score: number; // 4: ngon, 3: tam, 2: khe, 1: mom
  hour_of_day: number; // 0..23
  note: string | null;
  created_at: string;
  // Joined / Computed
  distance_km?: number;
  user?: Profile | null;
  warehouse?: Warehouse | null;
}

export interface OrderPredictionResult {
  hasData: boolean;
  currentHour: number;
  avgScore: number;
  totalCount: number;
  level: OrderRatingLevel | null;
  label: string;
  badgeText: string;
  color: 'emerald' | 'amber' | 'orange' | 'rose' | 'slate';
  bgClass: string;
  description: string;
  recentReportsCount: number;
}

export interface FloodReport {
  id: string;
  latitude: number;
  longitude: number;
  note?: string | null;
  user_id?: string | null;
  created_at: string;
  // Joined / Computed fields
  user?: Profile | null;
  distance_km?: number;
}
