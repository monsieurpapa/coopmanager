import React from 'react';

export const LOGO_FALLBACK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 48 48'%3E%3Crect width='48' height='48' rx='8' fill='%23f5f5f4'/%3E%3Ccircle cx='24' cy='19' r='7' fill='%23a8a29e'/%3E%3Cellipse cx='24' cy='36' rx='12' ry='7' fill='%23a8a29e'/%3E%3C/svg%3E";
export const IMAGE_FALLBACK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='600' viewBox='0 0 800 600'%3E%3Crect width='800' height='600' fill='%23e7e5e4'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='24' fill='%2378716c'%3ECoffee Cooperative%3C/text%3E%3C/svg%3E";

export const onLogoError = (e: React.SyntheticEvent<HTMLImageElement>) => {
  e.currentTarget.src = LOGO_FALLBACK;
};

export const onImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
  e.currentTarget.src = IMAGE_FALLBACK;
};
