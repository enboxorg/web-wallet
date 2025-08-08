import React from 'react';

interface EnboxLogoProps {
  size?: number;
  className?: string;
}

const EnboxLogo: React.FC<EnboxLogoProps> = ({ size = 40, className = '' }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="enboxGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
        <linearGradient id="enboxGradient2" x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#6d28d9" />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      
      {/* Outer box with gradient */}
      <path
        d="M 20 30 L 50 15 L 80 30 L 80 70 L 50 85 L 20 70 Z"
        fill="url(#enboxGradient)"
        opacity="0.9"
        filter="url(#glow)"
      />
      
      {/* Inner box face */}
      <path
        d="M 35 40 L 50 32 L 65 40 L 65 60 L 50 68 L 35 60 Z"
        fill="url(#enboxGradient2)"
        opacity="0.8"
      />
      
      {/* Top face */}
      <path
        d="M 20 30 L 50 15 L 50 32 L 35 40 Z"
        fill="#fafafa"
        opacity="0.15"
      />
      
      {/* Right face */}
      <path
        d="M 65 40 L 80 30 L 80 70 L 65 60 Z"
        fill="#000000"
        opacity="0.2"
      />
      
      {/* Accent lines */}
      <path
        d="M 50 15 L 50 32 M 35 40 L 35 60 M 65 40 L 65 60"
        stroke="#fafafa"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.3"
      />
    </svg>
  );
};

export default EnboxLogo;