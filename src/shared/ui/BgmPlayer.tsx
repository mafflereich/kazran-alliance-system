import React, { useEffect, useRef } from 'react';
import { useAppContext } from '@/store';

export default function BgmPlayer() {
  const { db, userVolume } = useAppContext();
  const audioRef = useRef<HTMLAudioElement>(null);
  const hasInteractedRef = useRef(false);

  const firstSettingId = db.settings && Object.keys(db.settings).length > 0 ? Object.keys(db.settings)[0] : 'default';
  const bgmUrl = db.settings?.[firstSettingId]?.bgmUrl;
  const bgmDefaultVolume = db.settings?.[firstSettingId]?.bgmDefaultVolume ?? 50;
  
  const volume = userVolume !== null ? userVolume : bgmDefaultVolume;

  useEffect(() => {
    if (!audioRef.current) return;

    // Clamp and apply volume
    const normalized = Math.max(0, Math.min(1, (volume ?? 0) / 100));
    audioRef.current.volume = normalized;

    // If muted, fully stop playback to avoid any residual sound
    if (volume === 0) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    } else {
      attemptPlay();
    }
  }, [volume]);

  const attemptPlay = () => {
    if (audioRef.current && bgmUrl && volume !== 0) {
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          // Autoplay was prevented, we'll wait for user interaction
          console.log("BGM Autoplay prevented, waiting for interaction.");
        });
      }
    }
  };

  useEffect(() => {
    if (audioRef.current && bgmUrl) {
      audioRef.current.src = bgmUrl;
      audioRef.current.load();
      attemptPlay();
    }
  }, [bgmUrl]);

  useEffect(() => {
    const handleFirstInteraction = () => {
      if (!hasInteractedRef.current) {
        hasInteractedRef.current = true;
        attemptPlay();
      }
    };

    window.addEventListener('click', handleFirstInteraction);
    window.addEventListener('keydown', handleFirstInteraction);
    window.addEventListener('touchstart', handleFirstInteraction);

    return () => {
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
    };
  }, [bgmUrl]);

  if (!bgmUrl) return null;

  return (
    <audio
      ref={audioRef}
      loop
      preload="auto"
      style={{ display: 'none' }}
    />
  );
}
