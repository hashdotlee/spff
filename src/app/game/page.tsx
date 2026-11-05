'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  Clock,
  DollarSign,
  Bike,
  Utensils,
  Package,
  MapPin,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  Volume2,
  VolumeX,
  Zap,
  Award,
  Info,
  RotateCcw,
  Sparkles,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Play,
  Pause,
  ArrowRight,
  ShieldAlert,
  Flame,
  Check,
  Share2,
} from 'lucide-react';

import {
  GameOrder,
  OrderType,
  ShiftStats,
  CompletedOrderRecord,
} from '@/lib/game/types';
import {
  TOTAL_SHIFT_MINUTES,
  DECISION_TIMEOUT_SECONDS,
  MAX_REJECTIONS_ENDGAME,
  REJECTION_PENALTY_THRESHOLD,
  REJECTION_PENALTY_MINUTES,
  ZONES,
  generateRandomOrder,
  rollActualWaitTime,
  formatMinutesToHours,
  formatCurrencyVND,
  formatCurrencyShort,
  getDriverRanking,
} from '@/lib/game/engine';
import {
  playShopeeRing,
  playAcceptSound,
  playRejectSound,
  playPenaltySound,
  playCashKachingSound,
  playGameOverSound,
  playVictorySound,
  setSoundEnabled,
  getSoundEnabled,
} from '@/lib/game/sounds';

type GameState = 'lobby' | 'waiting' | 'incoming' | 'delivering' | 'ended';

interface DeliveryAnimState {
  step: 'heading_to_shop' | 'waiting_food' | 'shipping' | 'completed';
  waitTime: number;
  travelTime: number;
  totalTime: number;
  earned: number;
}

export default function GamePage() {
  const [gameState, setGameState] = useState<GameState>('lobby');
  const [remainingMinutes, setRemainingMinutes] = useState<number>(TOTAL_SHIFT_MINUTES);
  const [currentOrder, setCurrentOrder] = useState<GameOrder | null>(null);
  const [decisionSecondsLeft, setDecisionSecondsLeft] = useState<number>(DECISION_TIMEOUT_SECONDS);
  const [soundOn, setSoundOn] = useState<boolean>(true);
  const [fastMode, setFastMode] = useState<boolean>(false);
  const [showGuideModal, setShowGuideModal] = useState<boolean>(false);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [penaltyAlert, setPenaltyAlert] = useState<{ show: boolean; strikeCount: number } | null>(null);
  const [deliveryAnim, setDeliveryAnim] = useState<DeliveryAnimState | null>(null);
  const [highScore, setHighScore] = useState<number>(0);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  const [stats, setStats] = useState<ShiftStats>({
    totalEarnings: 0,
    totalOrdersCompleted: 0,
    foodOrdersCount: 0,
    shipOrdersCount: 0,
    batchOrdersCount: 0,
    totalDistanceKm: 0,
    totalDriveMinutes: 0,
    totalWaitMinutes: 0,
    rejectionCount: 0,
    penaltiesCount: 0,
    penalizedMinutes: 0,
    isEndgame: false,
    completedOrders: [],
  });

  // Sound sync
  useEffect(() => {
    setSoundEnabled(soundOn);
  }, [soundOn]);

  // Load high score
  useEffect(() => {
    try {
      const saved = localStorage.getItem('spff_game_highscore');
      if (saved) setHighScore(parseInt(saved, 10) || 0);
    } catch (_) {}
  }, []);

  // Update high score when game ends
  const checkAndSaveHighScore = useCallback((earnings: number) => {
    try {
      const current = parseInt(localStorage.getItem('spff_game_highscore') || '0', 10);
      if (earnings > current) {
        localStorage.setItem('spff_game_highscore', earnings.toString());
        setHighScore(earnings);
      }
    } catch (_) {}
  }, []);

  // Countdown timer for incoming order decision
  useEffect(() => {
    if (gameState !== 'incoming') return;

    const timer = setInterval(() => {
      setDecisionSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          // Timed out => auto reject!
          handleReject(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [gameState, currentOrder]);

  // Push new order with short delay
  const pushNewOrder = useCallback(() => {
    setGameState('waiting');
    const delay = setTimeout(() => {
      const order = generateRandomOrder();
      setCurrentOrder(order);
      setDecisionSecondsLeft(DECISION_TIMEOUT_SECONDS);
      setGameState('incoming');
      playShopeeRing();
    }, 1500);

    return () => clearTimeout(delay);
  }, []);

  // Start new shift
  const handleStartShift = () => {
    setRemainingMinutes(TOTAL_SHIFT_MINUTES);
    setStats({
      totalEarnings: 0,
      totalOrdersCompleted: 0,
      foodOrdersCount: 0,
      shipOrdersCount: 0,
      batchOrdersCount: 0,
      totalDistanceKm: 0,
      totalDriveMinutes: 0,
      totalWaitMinutes: 0,
      rejectionCount: 0,
      penaltiesCount: 0,
      penalizedMinutes: 0,
      isEndgame: false,
      completedOrders: [],
    });
    setPenaltyAlert(null);
    setDeliveryAnim(null);
    pushNewOrder();
  };

  // Finish shift
  const handleEndShift = useCallback(
    (reason: 'timeout' | 'rejected_9_orders', currentStats: ShiftStats) => {
      setGameState('ended');
      setStats((prev) => ({
        ...prev,
        isEndgame: true,
        endgameReason: reason,
      }));
      checkAndSaveHighScore(currentStats.totalEarnings);
      if (reason === 'rejected_9_orders') {
        playGameOverSound();
      } else {
        playVictorySound();
      }
    },
    [checkAndSaveHighScore]
  );

  // Reject order
  const handleReject = (isAutoTimeout = false) => {
    if (!currentOrder || gameState !== 'incoming') return;

    playRejectSound();
    const newRejections = stats.rejectionCount + 1;
    let newMinutes = remainingMinutes;
    let newPenaltiesCount = stats.penaltiesCount;
    let newPenalizedMinutes = stats.penalizedMinutes;

    // Check penalty threshold: at 3, 6 rejections
    const isPenalized = newRejections === 3 || newRejections === 6;
    if (isPenalized) {
      newMinutes = Math.max(0, newMinutes - REJECTION_PENALTY_MINUTES);
      newPenaltiesCount += 1;
      newPenalizedMinutes += REJECTION_PENALTY_MINUTES;
      setPenaltyAlert({
        show: true,
        strikeCount: newRejections,
      });
      playPenaltySound();
    }

    const updatedStats: ShiftStats = {
      ...stats,
      rejectionCount: newRejections,
      penaltiesCount: newPenaltiesCount,
      penalizedMinutes: newPenalizedMinutes,
    };

    setStats(updatedStats);
    setRemainingMinutes(newMinutes);
    setCurrentOrder(null);

    // Check endgame conditions
    if (newRejections >= MAX_REJECTIONS_ENDGAME) {
      handleEndShift('rejected_9_orders', updatedStats);
      return;
    }

    if (newMinutes <= 0) {
      handleEndShift('timeout', updatedStats);
      return;
    }

    // Otherwise next order
    if (!isPenalized) {
      pushNewOrder();
    }
  };

  // Close penalty alert
  const handleDismissPenalty = () => {
    setPenaltyAlert(null);
    if (remainingMinutes <= 0) {
      handleEndShift('timeout', stats);
    } else {
      pushNewOrder();
    }
  };

  // Accept order
  const handleAccept = () => {
    if (!currentOrder || gameState !== 'incoming') return;

    playAcceptSound();
    const order = currentOrder;
    const waitTime = rollActualWaitTime(order);
    const totalOrderTime = order.travelMinutes + waitTime;

    if (fastMode) {
      // Fast mode: immediate completion
      completeOrder(order, waitTime, totalOrderTime);
      return;
    }

    // Animated delivery mode
    setGameState('delivering');
    setDeliveryAnim({
      step: 'heading_to_shop',
      waitTime,
      travelTime: order.travelMinutes,
      totalTime: totalOrderTime,
      earned: order.finalPrice,
    });

    // Step 1: Heading to merchant (600ms)
    setTimeout(() => {
      setDeliveryAnim((prev) => (prev ? { ...prev, step: 'waiting_food' } : null));

      // Step 2: Waiting for food / goods (900ms)
      setTimeout(() => {
        setDeliveryAnim((prev) => (prev ? { ...prev, step: 'shipping' } : null));

        // Step 3: Delivering to customer (800ms)
        setTimeout(() => {
          setDeliveryAnim((prev) => (prev ? { ...prev, step: 'completed' } : null));
          playCashKachingSound();

          // Step 4: Finish up (700ms)
          setTimeout(() => {
            completeOrder(order, waitTime, totalOrderTime);
          }, 800);
        }, 800);
      }, 900);
    }, 600);
  };

  // Finish delivering and update state
  const completeOrder = (
    order: GameOrder,
    waitTime: number,
    totalOrderTime: number
  ) => {
    playCashKachingSound();
    const newRemainingMinutes = Math.max(0, remainingMinutes - totalOrderTime);

    const record: CompletedOrderRecord = {
      orderId: order.id,
      code: order.code,
      type: order.type,
      itemCount: order.itemCount,
      zoneName: order.zone.shortName,
      distanceKm: order.distanceKm,
      earnings: order.finalPrice,
      travelMinutes: order.travelMinutes,
      waitMinutes: waitTime,
      totalMinutes: totalOrderTime,
      timeRemainingAfter: newRemainingMinutes,
    };

    const newStats: ShiftStats = {
      ...stats,
      totalEarnings: stats.totalEarnings + order.finalPrice,
      totalOrdersCompleted: stats.totalOrdersCompleted + 1,
      foodOrdersCount: stats.foodOrdersCount + (order.type === 'food' ? 1 : 0),
      shipOrdersCount: stats.shipOrdersCount + (order.type === 'ship' ? 1 : 0),
      batchOrdersCount: stats.batchOrdersCount + (order.itemCount > 1 ? 1 : 0),
      totalDistanceKm: Math.round((stats.totalDistanceKm + order.distanceKm) * 10) / 10,
      totalDriveMinutes: stats.totalDriveMinutes + order.travelMinutes,
      totalWaitMinutes: stats.totalWaitMinutes + waitTime,
      completedOrders: [record, ...stats.completedOrders],
    };

    setStats(newStats);
    setRemainingMinutes(newRemainingMinutes);
    setCurrentOrder(null);
    setDeliveryAnim(null);

    if (newRemainingMinutes <= 0) {
      handleEndShift('timeout', newStats);
    } else {
      pushNewOrder();
    }
  };

  // Instant skip delivery animation
  const handleSkipAnimation = () => {
    if (!currentOrder || !deliveryAnim) return;
    completeOrder(currentOrder, deliveryAnim.waitTime, deliveryAnim.totalTime);
  };

  // Copy share result
  const handleShareResult = () => {
    const rankInfo = getDriverRanking(stats);
    const text = `🛵 Thử thách 8 tiếng ShopeeFood!\n🏆 Xếp hạng: ${rankInfo.title}\n💰 Thu nhập: ${formatCurrencyVND(stats.totalEarnings)}\n📦 Đã giao: ${stats.totalOrdersCompleted} đơn (${stats.totalDistanceKm} km)\nChơi ngay tại: ${window.location.href}`;
    navigator.clipboard.writeText(text);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const shiftPercentage = Math.max(0, (remainingMinutes / TOTAL_SHIFT_MINUTES) * 100);

  return (
    <div className="w-full max-w-3xl mx-auto px-3 sm:px-4 py-3 sm:py-6 flex flex-col gap-4">
      {/* Top Header Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-3.5 sm:p-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-orange-500 text-white flex items-center justify-center shadow-xs font-black text-xl">
              🛵
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-black text-slate-900 leading-tight">
                  ShopeeFood Simulator
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-extrabold bg-orange-100 text-orange-700">
                  8 Tiếng Nhận Đơn
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">
                Lựa đơn thông minh, tối ưu thu nhập trong ca làm việc 8 tiếng!
              </p>
            </div>
          </div>

          {/* Quick Utility Controls */}
          <div className="flex items-center gap-1.5 ml-auto">
            <button
              onClick={() => setSoundOn(!soundOn)}
              className={`p-2 rounded-xl border text-xs font-bold transition flex items-center justify-center ${
                soundOn
                  ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                  : 'bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-200'
              }`}
              title={soundOn ? 'Tắt âm thanh' : 'Bật âm thanh'}
            >
              {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            <button
              onClick={() => setFastMode(!fastMode)}
              className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold transition flex items-center gap-1 ${
                fastMode
                  ? 'bg-purple-100 text-purple-700 border-purple-300'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
              title="Bỏ qua mô phỏng chạy xe để nhận đơn siêu tốc"
            >
              <Zap className={`w-3.5 h-3.5 ${fastMode ? 'text-purple-600 fill-purple-600' : ''}`} />
              <span className="hidden xs:inline">Siêu tốc</span>
            </button>

            <button
              onClick={() => setShowGuideModal(true)}
              className="p-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 text-xs font-bold transition flex items-center gap-1"
              title="Xem luật chơi và mẹo kiếm tiền"
            >
              <Info className="w-4 h-4 text-blue-600" />
            </button>
          </div>
        </div>

        {/* Shift Dashboard Stats */}
        {gameState !== 'lobby' && (
          <div className="mt-3.5 pt-3 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {/* Shift Timer */}
            <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200/80">
              <div className="flex items-center justify-between text-xs text-slate-500 font-semibold mb-1">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-blue-500" /> Còn lại
                </span>
                <span className="text-[10px] text-slate-400">8h</span>
              </div>
              <div className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                {formatMinutesToHours(remainingMinutes)}
              </div>
              {/* Progress bar */}
              <div className="w-full bg-slate-200 h-1.5 rounded-full mt-1.5 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    shiftPercentage > 40
                      ? 'bg-blue-500'
                      : shiftPercentage > 15
                      ? 'bg-amber-500'
                      : 'bg-red-500 animate-pulse'
                  }`}
                  style={{ width: `${shiftPercentage}%` }}
                />
              </div>
            </div>

            {/* Total Wallet */}
            <div className="bg-emerald-50 rounded-xl p-2.5 border border-emerald-200/80">
              <div className="flex items-center justify-between text-xs text-emerald-700 font-semibold mb-1">
                <span className="flex items-center gap-1">
                  <DollarSign className="w-3.5 h-3.5" /> Ví thu nhập
                </span>
                <span className="text-[10px] bg-emerald-200/60 text-emerald-800 px-1 rounded font-bold">
                  +{stats.totalOrdersCompleted} đơn
                </span>
              </div>
              <div className="text-base sm:text-lg font-black text-emerald-800 tracking-tight">
                {formatCurrencyVND(stats.totalEarnings)}
              </div>
              <div className="text-[11px] text-emerald-600 font-medium truncate mt-0.5">
                {stats.totalDistanceKm} km đã chạy
              </div>
            </div>

            {/* Rejection Strikes */}
            <div className="bg-rose-50 rounded-xl p-2.5 border border-rose-200/80 col-span-2 sm:col-span-2">
              <div className="flex items-center justify-between text-xs text-rose-700 font-bold mb-1.5">
                <span className="flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-500" /> Từ chối:{' '}
                  {stats.rejectionCount}/9 đơn
                </span>
                <span className="text-[10px] text-rose-600 font-medium">
                  3 đơn = -40p | 9 đơn = Khóa app!
                </span>
              </div>
              {/* 9 visual strike boxes */}
              <div className="grid grid-cols-9 gap-1">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((strike) => {
                  const isChecked = stats.rejectionCount >= strike;
                  const isPenalty = strike === 3 || strike === 6;
                  const isGameOver = strike === 9;

                  return (
                    <div
                      key={strike}
                      className={`h-4.5 rounded-md flex items-center justify-center text-[10px] font-black border transition ${
                        isChecked
                          ? isGameOver
                            ? 'bg-red-600 border-red-700 text-white animate-pulse'
                            : isPenalty
                            ? 'bg-amber-500 border-amber-600 text-white'
                            : 'bg-rose-400 border-rose-500 text-white'
                          : isGameOver
                          ? 'bg-white border-red-200 text-red-400'
                          : isPenalty
                          ? 'bg-white border-amber-300 text-amber-500'
                          : 'bg-white border-slate-200 text-slate-400'
                      }`}
                      title={
                        isGameOver
                          ? 'Đơn thứ 9: Khóa tài khoản'
                          : isPenalty
                          ? `Đơn thứ ${strike}: Phạt -40 phút`
                          : `Đơn từ chối ${strike}`
                      }
                    >
                      {isChecked ? '✕' : strike}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Game Screen Area */}
      {gameState === 'lobby' && (
        <div className="bg-white rounded-3xl border border-slate-200 p-6 text-center flex flex-col items-center justify-center gap-4 py-12 shadow-sm">
          <div className="w-20 h-20 rounded-3xl bg-orange-100 border-2 border-orange-200 flex items-center justify-center text-4xl shadow-inner">
            🛵
          </div>

          <div className="max-w-md">
            <h2 className="text-xl sm:text-2xl font-black text-slate-900">
              Sẵn Sàng Bắt Đầu Ca Làm Việc 8H?
            </h2>
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">
              Hệ thống sẽ liên tục bắn đơn ShopeeFood. Bạn có 8 tiếng để tối ưu thu nhập.
              Cân nhắc kỹ giữa <span className="font-bold text-orange-600">Đơn Food</span> (chờ quán
              1-20p) và <span className="font-bold text-blue-600">Đơn Ship</span> (0p chờ quán, đi ngay).
            </p>
          </div>

          {highScore > 0 && (
            <div className="px-4 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold flex items-center gap-1.5">
              <Award className="w-4 h-4 text-amber-600" />
              Kỷ lục thu nhập ca cao nhất của bạn: {formatCurrencyVND(highScore)}
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-center gap-3 w-full max-w-xs mt-2">
            <button
              onClick={handleStartShift}
              className="w-full py-3.5 px-6 rounded-2xl bg-orange-600 hover:bg-orange-700 active:scale-95 text-white font-extrabold text-base shadow-md shadow-orange-500/20 transition flex items-center justify-center gap-2"
            >
              <Play className="w-5 h-5 fill-white" />
              Bật App Bắt Đầu Ca
            </button>
            <button
              onClick={() => setShowGuideModal(true)}
              className="w-full py-3 px-4 rounded-2xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-sm transition"
            >
              📖 Xem Luật & Bảng Giá
            </button>
          </div>
        </div>
      )}

      {/* Waiting for order status */}
      {gameState === 'waiting' && (
        <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center flex flex-col items-center justify-center gap-3 shadow-xs">
          <div className="relative">
            <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center text-3xl animate-bounce">
              📡
            </div>
            <div className="absolute inset-0 rounded-full border-2 border-orange-400 animate-ping opacity-30" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 mt-2">
            Hệ thống đang quét đơn mới quanh bạn...
          </h3>
          <p className="text-xs text-slate-500">
            Giữ màn hình mở và sẵn sàng cân đo quãng đường & thời gian!
          </p>
        </div>
      )}

      {/* Incoming Order Card - Real ShopeeFood Driver Style */}
      {gameState === 'incoming' && currentOrder && (
        <div className="bg-white rounded-3xl border-2 border-orange-500 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          {/* Header of Order Card */}
          <div className="bg-gradient-to-r from-orange-500 to-amber-500 text-white px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-white/20 backdrop-blur-xs flex items-center justify-center text-base">
                {currentOrder.type === 'food' ? '🍜' : '📦'}
              </span>
              <div>
                <span className="text-xs font-black uppercase tracking-wider block">
                  {currentOrder.type === 'food' ? 'Đơn Món Ăn (ShopeeFood)' : 'Đơn Giao Hàng (SPX)'}
                </span>
                <span className="text-[11px] opacity-90 font-medium">{currentOrder.code}</span>
              </div>
            </div>

            {/* Countdown timer */}
            <div className="flex items-center gap-1.5 bg-black/20 backdrop-blur-xs px-2.5 py-1 rounded-full text-xs font-black">
              <Clock className="w-3.5 h-3.5 animate-spin" />
              <span>{decisionSecondsLeft}s</span>
            </div>
          </div>

          {/* Decision Time Progress Bar */}
          <div className="w-full bg-orange-200 h-1.5 overflow-hidden">
            <div
              className="bg-orange-600 h-full transition-all duration-1000 ease-linear"
              style={{
                width: `${(decisionSecondsLeft / DECISION_TIMEOUT_SECONDS) * 100}%`,
              }}
            />
          </div>

          {/* Order Details Body */}
          <div className="p-4 sm:p-5 flex flex-col gap-4">
            {/* Key Badges & Zone Info */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Batch badge */}
              {currentOrder.itemCount > 1 ? (
                <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-red-100 text-red-700 border border-red-200 flex items-center gap-1">
                  <Flame className="w-3.5 h-3.5 fill-red-500 text-red-500" />
                  Đơn ghép {currentOrder.itemCount} chặng
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                  Đơn lẻ 1 chặng
                </span>
              )}

              {/* Zone badge */}
              <span
                className={`px-2.5 py-1 rounded-full text-xs font-bold border ${currentOrder.zone.badgeColor}`}
              >
                📍 {currentOrder.zone.shortName}
              </span>

              {/* Price multiplier tag */}
              {currentOrder.zone.priceMultiplier !== 1.0 && (
                <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-100 text-amber-800">
                  Hệ số {currentOrder.zone.priceMultiplier}x
                </span>
              )}
            </div>

            {/* Big Price & Distance Highlights */}
            <div className="grid grid-cols-2 gap-3 bg-slate-50 rounded-2xl p-3 sm:p-4 border border-slate-200/80">
              <div>
                <span className="text-xs text-slate-500 font-bold block uppercase tracking-wide">
                  Tiền Thu Nhập
                </span>
                <div className="text-2xl sm:text-3xl font-black text-orange-600 tracking-tight">
                  {formatCurrencyVND(currentOrder.finalPrice)}
                </div>
                {currentOrder.itemCount > 1 && (
                  <span className="text-[11px] text-slate-500">
                    (~{formatCurrencyShort(Math.round(currentOrder.finalPrice / currentOrder.itemCount))}/đơn)
                  </span>
                )}
              </div>

              <div>
                <span className="text-xs text-slate-500 font-bold block uppercase tracking-wide">
                  Quãng Đường
                </span>
                <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                  {currentOrder.distanceKm} km
                </div>
                <span className="text-[11px] text-slate-500">
                  ~{currentOrder.travelMinutes}p chạy xe (30km/h)
                </span>
              </div>
            </div>

            {/* Time Breakdown & Strategy Analysis */}
            <div className="bg-amber-50/60 rounded-2xl p-3 border border-amber-200/80 text-xs flex flex-col gap-2">
              <div className="font-extrabold text-amber-900 flex items-center justify-between">
                <span>⏱️ Cân nhắc thời gian thực hiện:</span>
                <span className="text-[11px] font-normal text-amber-700">
                  Tốc độ di chuyển: 2p/km
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-slate-800">
                <div className="bg-white p-2 rounded-xl border border-amber-100">
                  <span className="text-slate-500 block text-[11px]">⏳ Chờ quán chế biến:</span>
                  <span className="font-bold text-slate-900">
                    {currentOrder.type === 'ship' ? (
                      <span className="text-emerald-600 font-black">0 phút (Không chờ quán! ⚡)</span>
                    ) : (
                      <span className="text-amber-700">
                        {currentOrder.potentialWaitMinutes.min} ~{' '}
                        {currentOrder.potentialWaitMinutes.max} phút (Hên xui)
                      </span>
                    )}
                  </span>
                </div>

                <div className="bg-white p-2 rounded-xl border border-amber-100">
                  <span className="text-slate-500 block text-[11px]">⏱️ Dự kiến tổng thời gian:</span>
                  <span className="font-bold text-slate-900">
                    {currentOrder.type === 'ship' ? (
                      `${currentOrder.travelMinutes} phút`
                    ) : (
                      `${currentOrder.travelMinutes + currentOrder.potentialWaitMinutes.min} ~ ${
                        currentOrder.travelMinutes + currentOrder.potentialWaitMinutes.max
                      } phút`
                    )}
                  </span>
                </div>
              </div>

              {/* Driver note */}
              <div className="text-[11px] text-slate-600 flex items-start gap-1 mt-0.5">
                <span className="shrink-0 font-bold">💡 Ghi chú:</span>
                <span>{currentOrder.notes}</span>
              </div>
            </div>

            {/* Merchant and Customer Destination */}
            <div className="flex flex-col gap-2 text-xs border-t border-slate-100 pt-3">
              <div className="flex items-start gap-2">
                <div className="w-5 h-5 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center shrink-0 mt-0.5 font-bold">
                  1
                </div>
                <div className="leading-tight">
                  <span className="text-slate-400 text-[10px] block">Điểm lấy hàng:</span>
                  <span className="font-bold text-slate-800">{currentOrder.merchantName}</span>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5 font-bold">
                  2
                </div>
                <div className="leading-tight">
                  <span className="text-slate-400 text-[10px] block">Điểm giao hàng:</span>
                  <span className="font-bold text-slate-800">{currentOrder.deliveryAddress}</span>
                </div>
              </div>
            </div>

            {/* Decision Action Buttons */}
            <div className="grid grid-cols-2 gap-3 mt-1 pt-2">
              <button
                onClick={() => handleReject(false)}
                className="py-3 px-4 rounded-2xl border-2 border-slate-300 bg-white hover:bg-slate-50 active:scale-95 text-slate-700 font-extrabold text-sm transition flex items-center justify-center gap-1.5 shadow-xs"
              >
                <XCircle className="w-4 h-4 text-slate-400" />
                <span>Từ chối</span>
              </button>

              <button
                onClick={handleAccept}
                className="py-3 px-4 rounded-2xl bg-orange-600 hover:bg-orange-700 active:scale-95 text-white font-extrabold text-sm transition shadow-lg shadow-orange-600/30 flex items-center justify-center gap-1.5"
              >
                <Check className="w-5 h-5" />
                <span>Nhận Đơn (+{formatCurrencyShort(currentOrder.finalPrice)})</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delivery Simulation Modal / Overlay */}
      {gameState === 'delivering' && deliveryAnim && currentOrder && (
        <div className="bg-white rounded-3xl border border-slate-200 p-6 flex flex-col items-center justify-center text-center gap-4 shadow-lg animate-in fade-in duration-150">
          <div className="w-20 h-20 rounded-full bg-orange-50 border-2 border-orange-200 flex items-center justify-center text-4xl animate-pulse">
            {deliveryAnim.step === 'heading_to_shop'
              ? '🛵'
              : deliveryAnim.step === 'waiting_food'
              ? currentOrder.type === 'ship'
                ? '📦'
                : '⏳'
              : deliveryAnim.step === 'shipping'
              ? '💨'
              : '🎉'}
          </div>

          <div className="max-w-sm">
            <span className="text-xs font-bold text-orange-600 uppercase tracking-wider block">
              Mô Phỏng Thực Hiện Đơn
            </span>
            <h3 className="text-lg font-black text-slate-900 mt-1">
              {deliveryAnim.step === 'heading_to_shop' && 'Đang tới điểm lấy hàng...'}
              {deliveryAnim.step === 'waiting_food' &&
                (currentOrder.type === 'ship'
                  ? 'Đơn Ship - Bốc kiện bưu phẩm đi ngay (0 phút)!'
                  : `Chờ quán chuẩn bị món ăn: ${deliveryAnim.waitTime} phút!`)}
              {deliveryAnim.step === 'shipping' &&
                `Đang di chuyển giao hàng (${currentOrder.distanceKm} km)...`}
              {deliveryAnim.step === 'completed' &&
                `Giao thành công! +${formatCurrencyVND(deliveryAnim.earned)}`}
            </h3>

            <p className="text-xs text-slate-500 mt-1">
              Thời gian ca bị trừ:{' '}
              <span className="font-bold text-slate-800">
                {deliveryAnim.travelTime}p (di chuyển) + {deliveryAnim.waitTime}p (chờ) ={' '}
                {deliveryAnim.totalTime} phút
              </span>
            </p>
          </div>

          <button
            onClick={handleSkipAnimation}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center gap-1 active:scale-95"
          >
            <Zap className="w-3.5 h-3.5 text-purple-600" />
            <span>Bỏ qua hoạt ảnh & nhận tiền ngay</span>
          </button>
        </div>
      )}

      {/* Penalty Warning Modal */}
      {penaltyAlert && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 text-center border-2 border-amber-500 shadow-2xl flex flex-col items-center gap-3 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-3xl">
              ⚠️
            </div>
            <h3 className="text-xl font-black text-slate-900">
              PHẠT TRỪ 40 PHÚT!
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Bạn vừa từ chối đơn hàng thứ <span className="font-black text-rose-600">{penaltyAlert.strikeCount}</span>!
              Theo quy định của ShopeeFood, từ chối mỗi 3 đơn sẽ bị phạt trừ{' '}
              <span className="font-bold text-red-600">40 phút thời gian ca làm việc</span>.
            </p>
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 font-semibold w-full">
              Từ chối 9 đơn sẽ bị KHÓA TÀI KHOẢN (Endgame) ngay lập tức!
            </div>
            <button
              onClick={handleDismissPenalty}
              className="w-full py-3 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-sm transition shadow-md active:scale-95"
            >
              Đã hiểu & Tiếp tục
            </button>
          </div>
        </div>
      )}

      {/* Endgame / Shift Finished Screen */}
      {gameState === 'ended' && (
        <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 flex flex-col items-center text-center gap-5 shadow-lg animate-in zoom-in-95 duration-200">
          {(() => {
            const rank = getDriverRanking(stats);
            const isFired = stats.rejectionCount >= MAX_REJECTIONS_ENDGAME;
            const hoursWorked = Math.max(0.1, (TOTAL_SHIFT_MINUTES - remainingMinutes) / 60);
            const avgHourly = Math.round(stats.totalEarnings / hoursWorked);

            return (
              <>
                <div className="w-20 h-20 rounded-3xl bg-slate-100 flex items-center justify-center text-4xl shadow-inner">
                  {isFired ? '⛔' : '🏆'}
                </div>

                <div>
                  <div
                    className={`inline-block px-3 py-1 rounded-full text-xs font-black uppercase mb-2 ${rank.badgeColor}`}
                  >
                    Hạng {rank.rank} • {rank.title}
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-black text-slate-900">
                    {isFired ? 'Tài Khoản Bị Khóa Sớm!' : 'Hoàn Thành Ca 8 Tiếng!'}
                  </h2>
                  <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                    {rank.comment}
                  </p>
                </div>

                {/* Final Stats Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 w-full max-w-xl">
                  <div className="bg-emerald-50 rounded-2xl p-3 border border-emerald-200 text-left">
                    <span className="text-[11px] text-emerald-700 font-bold block">Tổng thu nhập</span>
                    <span className="text-xl font-black text-emerald-900">
                      {formatCurrencyVND(stats.totalEarnings)}
                    </span>
                  </div>

                  <div className="bg-blue-50 rounded-2xl p-3 border border-blue-200 text-left">
                    <span className="text-[11px] text-blue-700 font-bold block">Thu nhập / Giờ</span>
                    <span className="text-xl font-black text-blue-900">
                      {formatCurrencyShort(avgHourly)}/h
                    </span>
                  </div>

                  <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200 text-left">
                    <span className="text-[11px] text-slate-600 font-bold block">Đơn hoàn thành</span>
                    <span className="text-xl font-black text-slate-900">
                      {stats.totalOrdersCompleted} đơn
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      {stats.foodOrdersCount} Food | {stats.shipOrdersCount} Ship
                    </span>
                  </div>

                  <div className="bg-amber-50 rounded-2xl p-3 border border-amber-200 text-left">
                    <span className="text-[11px] text-amber-700 font-bold block">Quãng đường</span>
                    <span className="text-xl font-black text-amber-900">
                      {stats.totalDistanceKm} km
                    </span>
                    <span className="text-[10px] text-amber-600 block mt-0.5">
                      Chờ quán: {stats.totalWaitMinutes}p
                    </span>
                  </div>
                </div>

                {/* Highscore notice */}
                {stats.totalEarnings >= highScore && stats.totalEarnings > 0 && (
                  <div className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-400 to-yellow-300 text-slate-900 font-black text-xs flex items-center gap-1.5 shadow-xs">
                    <Sparkles className="w-4 h-4 fill-slate-900" />
                    KỶ LỤC MỚI CỦA BẠN: {formatCurrencyVND(stats.totalEarnings)}!
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full max-w-sm">
                  <button
                    onClick={handleStartShift}
                    className="w-full py-3.5 px-6 rounded-2xl bg-orange-600 hover:bg-orange-700 active:scale-95 text-white font-black text-sm shadow-md transition flex items-center justify-center gap-2"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Bắt Đầu Ca Mới
                  </button>

                  <button
                    onClick={handleShareResult}
                    className="w-full py-3 px-4 rounded-2xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs transition flex items-center justify-center gap-1.5"
                  >
                    <Share2 className="w-4 h-4" />
                    {copiedLink ? 'Đã sao chép kết quả!' : 'Chia sẻ kết quả'}
                  </button>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* Completed Orders History (Collapsible) */}
      {stats.completedOrders.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="w-full p-3.5 flex items-center justify-between text-left hover:bg-slate-50 transition"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-800">
                📋 Nhật ký đơn đã chạy trong ca ({stats.completedOrders.length} đơn)
              </span>
            </div>
            {showHistory ? (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {showHistory && (
            <div className="border-t border-slate-100 divide-y divide-slate-100 max-h-72 overflow-y-auto">
              {stats.completedOrders.map((rec, idx) => (
                <div
                  key={`${rec.orderId}_${idx}`}
                  className="p-3 text-xs flex items-center justify-between gap-2 hover:bg-slate-50/60 transition"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-base">{rec.type === 'food' ? '🍜' : '📦'}</span>
                    <div className="truncate">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-800">{rec.code}</span>
                        {rec.itemCount > 1 && (
                          <span className="px-1.5 py-0.2 bg-red-100 text-red-700 rounded text-[10px] font-bold">
                            Ghép {rec.itemCount}
                          </span>
                        )}
                        <span className="text-slate-400 text-[10px]">{rec.zoneName}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {rec.distanceKm} km • Chạy: {rec.travelMinutes}p • Chờ: {rec.waitMinutes}p (Tổng{' '}
                        {rec.totalMinutes}p)
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="font-black text-emerald-700 block">
                      +{formatCurrencyVND(rec.earnings)}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Còn {formatMinutesToHours(rec.timeRemainingAfter)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Guide & Rules Modal */}
      {showGuideModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full max-h-[88vh] flex flex-col overflow-hidden border border-slate-200 shadow-2xl">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <span className="text-xl">📖</span>
                <h3 className="font-extrabold text-slate-900 text-base">
                  Luật Chơi & Công Thức Tính Tiền
                </h3>
              </div>
              <button
                onClick={() => setShowGuideModal(false)}
                className="w-8 h-8 rounded-full bg-slate-200/80 hover:bg-slate-300 text-slate-600 flex items-center justify-center font-bold text-sm transition"
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-4 overflow-y-auto text-xs text-slate-700 flex flex-col gap-4 leading-relaxed">
              {/* Rules summary */}
              <div className="bg-orange-50 p-3 rounded-2xl border border-orange-200/80">
                <h4 className="font-extrabold text-orange-900 text-xs mb-1.5 flex items-center gap-1">
                  ⏱️ Quy Chế Ca Làm Việc 8 Tiếng
                </h4>
                <ul className="list-disc pl-4 space-y-1 text-orange-950">
                  <li>Mỗi ngày làm việc chuẩn <strong>8 tiếng (480 phút)</strong>.</li>
                  <li>
                    Thời gian hoàn thành đơn = <strong>Thời gian chạy xe (30 km/h = 2 phút/km)</strong> +{' '}
                    <strong>Thời gian chờ quán</strong>.
                  </li>
                  <li>
                    <strong>Đơn Food:</strong> Thời gian chờ quán ngẫu nhiên từ <strong>1 đến 20 phút</strong>.
                  </li>
                  <li>
                    <strong>Đơn Ship (SPX):</strong> <strong>0 phút chờ quán</strong> (lấy hàng đi ngay!).
                  </li>
                </ul>
              </div>

              {/* Penalty rules */}
              <div className="bg-rose-50 p-3 rounded-2xl border border-rose-200/80">
                <h4 className="font-extrabold text-rose-900 text-xs mb-1.5 flex items-center gap-1">
                  ⚠️ Hình Phạt Từ Chối Đơn
                </h4>
                <ul className="list-disc pl-4 space-y-1 text-rose-950">
                  <li>
                    Từ chối <strong>3 đơn</strong> (và <strong>6 đơn</strong>): Bị phạt trừ{' '}
                    <strong>40 phút</strong> vào ca làm việc!
                  </li>
                  <li>
                    Từ chối <strong>9 đơn</strong>: <strong>Khóa tài khoản (Endgame ngay)</strong>.
                  </li>
                </ul>
              </div>

              {/* Pricing Formula */}
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
                <h4 className="font-extrabold text-slate-900 text-xs mb-1.5 flex items-center gap-1">
                  💰 Công Thức Tính Tiền Đơn Hàng Chuẩn
                </h4>
                <div className="space-y-2">
                  <div className="p-2 bg-white rounded-xl border border-slate-200">
                    <span className="font-bold text-orange-600 block">🍜 Đơn Food (Món Ăn):</span>
                    <ul className="list-disc pl-4 space-y-0.5 mt-1">
                      <li>Đơn lẻ dưới 3km: đồng giá <strong>13.5k</strong>.</li>
                      <li>Đơn lẻ trên 3km: 13.5k + (km - 3) × <strong>4.025đ/km</strong> (Ví dụ 6.9km = 29.2k).</li>
                      <li>
                        Đơn ghép (tối đa 5 đơn): đơn đầu 13.5k, mỗi đơn thêm <strong>+6.5k</strong> + cước km (Ví dụ
                        ghép 4 đơn 7.1km = 46.1k; ghép 5 đơn 5.8km = 47.3k).
                      </li>
                    </ul>
                  </div>

                  <div className="p-2 bg-white rounded-xl border border-slate-200">
                    <span className="font-bold text-blue-600 block">📦 Đơn Ship (Giao Hàng):</span>
                    <ul className="list-disc pl-4 space-y-0.5 mt-1">
                      <li>3km đầu tiên: đồng giá <strong>15k</strong>.</li>
                      <li>
                        Đơn ship ghép: đơn đầu 15k, mỗi đơn ship thêm <strong>+25k</strong> + cước km 2.71k/km (Ví dụ
                        ghép 2 đơn 27km = 105.1k; ghép 4 đơn 28km = 157.8k).
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* 4 Geographic Zones */}
              <div className="bg-purple-50 p-3 rounded-2xl border border-purple-200/80">
                <h4 className="font-extrabold text-purple-900 text-xs mb-1.5 flex items-center gap-1">
                  🗺️ 4 Phân Vùng Địa Lý & Chiến Lược
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                  {ZONES.map((zone) => (
                    <div key={zone.id} className="bg-white p-2 rounded-xl border border-purple-100 text-[11px]">
                      <span className="font-bold text-purple-950 block">{zone.name}</span>
                      <p className="text-slate-600 mt-0.5">{zone.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pro tips */}
              <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200 text-emerald-950">
                <h4 className="font-bold text-emerald-900 mb-1">💡 Mẹo Để Lọt Top S+:</h4>
                <p>
                  Đơn Ship đường dài không có thời gian chờ quán (0p), mang lại thu nhập cực khủng theo giờ nếu
                  tận dụng tốt. Hãy cẩn thận với đơn Food ngắn nhưng rơi vào quán đông (chờ đến 20 phút) sẽ kéo tụt
                  thu nhập / giờ của bạn!
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                onClick={() => setShowGuideModal(false)}
                className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition"
              >
                Đóng hướng dẫn
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
