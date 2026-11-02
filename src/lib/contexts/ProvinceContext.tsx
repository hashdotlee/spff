'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { VIETNAM_PROVINCES } from '@/lib/constants/provinces';

interface ProvinceContextType {
  province: string;
  setProvince: (newProvince: string) => void;
  isPickerOpen: boolean;
  openPicker: () => void;
  closePicker: () => void;
}

const ProvinceContext = createContext<ProvinceContextType | undefined>(undefined);

const STORAGE_KEY = 'spff_selected_province';
const DEFAULT_PROVINCE = 'Hà Nội';

export function ProvinceProvider({ children }: { children: React.ReactNode }) {
  const [province, setProvinceState] = useState<string>(DEFAULT_PROVINCE);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  // Khôi phục tỉnh thành đã chọn từ localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && VIETNAM_PROVINCES.includes(saved as any)) {
        setProvinceState(saved);
      }
    } catch (e) {
      console.warn('Lỗi đọc localStorage province:', e);
    }
  }, []);

  function setProvince(newProvince: string) {
    if (!newProvince) return;
    setProvinceState(newProvince);
    try {
      localStorage.setItem(STORAGE_KEY, newProvince);
    } catch (e) {
      console.warn('Lỗi lưu localStorage province:', e);
    }
  }

  function openPicker() {
    setIsPickerOpen(true);
  }

  function closePicker() {
    setIsPickerOpen(false);
  }

  return (
    <ProvinceContext.Provider
      value={{
        province,
        setProvince,
        isPickerOpen,
        openPicker,
        closePicker,
      }}
    >
      {children}
    </ProvinceContext.Provider>
  );
}

export function useProvince() {
  const context = useContext(ProvinceContext);
  if (!context) {
    throw new Error('useProvince must be used within a ProvinceProvider');
  }
  return context;
}
