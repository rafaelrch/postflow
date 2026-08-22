'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';

/**
 * SphereImageGrid - Interactive 3D Image Sphere Component
 *
 * Displays images arranged in a 3D sphere layout with drag-to-rotate,
 * momentum physics, and optional auto-rotation.
 */

export interface Position3D {
  x: number;
  y: number;
  z: number;
}

export interface SphericalPosition {
  theta: number;
  phi: number;
  radius: number;
}

export interface WorldPosition extends Position3D {
  scale: number;
  zIndex: number;
  isVisible: boolean;
  fadeOpacity: number;
  originalIndex: number;
}

export interface ImageData {
  id: string;
  src: string;
  alt: string;
  title?: string;
  description?: string;
  isPlaceholder?: boolean;
}

export interface SphereImageGridProps {
  images?: ImageData[];
  containerSize?: number;
  sphereRadius?: number;
  dragSensitivity?: number;
  momentumDecay?: number;
  maxRotationSpeed?: number;
  baseImageScale?: number;
  hoverScale?: number;
  perspective?: number;
  autoRotate?: boolean;
  autoRotateSpeed?: number;
  responsive?: boolean;
  className?: string;
}

interface RotationState {
  x: number;
  y: number;
  z: number;
}

interface VelocityState {
  x: number;
  y: number;
}

interface MousePosition {
  x: number;
  y: number;
}

const SPHERE_MATH = {
  degreesToRadians: (degrees: number): number => degrees * (Math.PI / 180),
  radiansToDegrees: (radians: number): number => radians * (180 / Math.PI),
  sphericalToCartesian: (radius: number, theta: number, phi: number): Position3D => ({
    x: radius * Math.sin(phi) * Math.cos(theta),
    y: radius * Math.cos(phi),
    z: radius * Math.sin(phi) * Math.sin(theta),
  }),
  calculateDistance: (pos: Position3D, center: Position3D = { x: 0, y: 0, z: 0 }): number => {
    const dx = pos.x - center.x;
    const dy = pos.y - center.y;
    const dz = pos.z - center.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  },
  normalizeAngle: (angle: number): number => {
    while (angle > 180) angle -= 360;
    while (angle < -180) angle += 360;
    return angle;
  },
};

const SphereImageGrid: React.FC<SphereImageGridProps> = ({
  images = [],
  containerSize = 400,
  sphereRadius = 200,
  dragSensitivity = 0.5,
  momentumDecay = 0.95,
  maxRotationSpeed = 5,
  baseImageScale = 0.12,
  hoverScale = 1.2,
  perspective = 1000,
  autoRotate = false,
  autoRotateSpeed = 0.3,
  responsive = false,
  className = '',
}) => {
  const [isMounted, setIsMounted] = useState(false);
  const [rotation, setRotation] = useState<RotationState>({ x: 15, y: 15, z: 0 });
  const [velocity, setVelocity] = useState<VelocityState>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [imagePositions, setImagePositions] = useState<SphericalPosition[]>([]);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [responsiveSize, setResponsiveSize] = useState(containerSize);

  const containerRef = useRef<HTMLDivElement>(null);
  const lastMousePos = useRef<MousePosition>({ x: 0, y: 0 });
  const animationFrame = useRef<number | null>(null);

  const renderedContainerSize = responsive ? responsiveSize : containerSize;
  const baseImageSize = renderedContainerSize * baseImageScale;
  const actualSphereRadius = sphereRadius
    ? Math.min(
        sphereRadius,
        responsive
          ? Math.max(0, renderedContainerSize * 0.5 - baseImageSize * 0.6)
          : renderedContainerSize * 0.5,
      )
      : renderedContainerSize * 0.5;

  useEffect(() => {
    if (!isMounted) return;

    if (!responsive) {
      setResponsiveSize(containerSize);
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    const updateResponsiveSize = () => {
      const width = container.getBoundingClientRect().width;
      setResponsiveSize(Math.max(1, Math.min(containerSize, width)));
    };

    updateResponsiveSize();
    if (typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(updateResponsiveSize);
    observer.observe(container);

    return () => observer.disconnect();
  }, [isMounted, responsive, containerSize]);

  const generateSpherePositions = useCallback((): SphericalPosition[] => {
    const positions: SphericalPosition[] = [];
    const imageCount = images.length;
    const goldenRatio = (1 + Math.sqrt(5)) / 2;
    const angleIncrement = (2 * Math.PI) / goldenRatio;

    for (let i = 0; i < imageCount; i += 1) {
      const t = i / imageCount;
      const inclination = Math.acos(1 - 2 * t);
      const azimuth = angleIncrement * i;

      let phi = inclination * (180 / Math.PI);
      let theta = (azimuth * (180 / Math.PI)) % 360;
      const poleBonus = Math.pow(Math.abs(phi - 90) / 90, 0.6) * 35;

      if (phi < 90) phi = Math.max(5, phi - poleBonus);
      else phi = Math.min(175, phi + poleBonus);

      phi = 15 + (phi / 180) * 150;
      theta = (theta + (Math.random() - 0.5) * 20) % 360;
      phi = Math.max(0, Math.min(180, phi + (Math.random() - 0.5) * 10));

      positions.push({ theta, phi, radius: actualSphereRadius });
    }

    return positions;
  }, [images.length, actualSphereRadius]);

  const clampRotationSpeed = useCallback(
    (speed: number): number => Math.max(-maxRotationSpeed, Math.min(maxRotationSpeed, speed)),
    [maxRotationSpeed],
  );

  const calculateWorldPositions = useCallback((): WorldPosition[] => {
    const positions = imagePositions.map((pos, index) => {
      const thetaRad = SPHERE_MATH.degreesToRadians(pos.theta);
      const phiRad = SPHERE_MATH.degreesToRadians(pos.phi);
      const rotXRad = SPHERE_MATH.degreesToRadians(rotation.x);
      const rotYRad = SPHERE_MATH.degreesToRadians(rotation.y);

      let x = pos.radius * Math.sin(phiRad) * Math.cos(thetaRad);
      let y = pos.radius * Math.cos(phiRad);
      let z = pos.radius * Math.sin(phiRad) * Math.sin(thetaRad);

      const x1 = x * Math.cos(rotYRad) + z * Math.sin(rotYRad);
      const z1 = -x * Math.sin(rotYRad) + z * Math.cos(rotYRad);
      x = x1;
      z = z1;

      const y2 = y * Math.cos(rotXRad) - z * Math.sin(rotXRad);
      const z2 = y * Math.sin(rotXRad) + z * Math.cos(rotXRad);
      y = y2;
      z = z2;

      const worldPos: Position3D = { x, y, z };
      const fadeZoneStart = -10;
      const fadeZoneEnd = -30;
      const isVisible = worldPos.z > fadeZoneEnd;
      let fadeOpacity = 1;

      if (worldPos.z <= fadeZoneStart) {
        fadeOpacity = Math.max(
          0,
          (worldPos.z - fadeZoneEnd) / (fadeZoneStart - fadeZoneEnd),
        );
      }

      const isPoleImage = pos.phi < 30 || pos.phi > 150;
      const distanceFromCenter = Math.sqrt(x * x + y * y);
      const distanceRatio = Math.min(distanceFromCenter / actualSphereRadius, 1);
      const distancePenalty = isPoleImage ? 0.4 : 0.7;
      const centerScale = Math.max(0.3, 1 - distanceRatio * distancePenalty);
      const depthScale = (z + actualSphereRadius) / (2 * actualSphereRadius);
      const scale = centerScale * Math.max(0.5, 0.8 + depthScale * 0.3);

      return {
        ...worldPos,
        scale,
        zIndex: Math.round(1000 + z),
        isVisible,
        fadeOpacity,
        originalIndex: index,
      };
    });

    const adjustedPositions = [...positions];

    for (let i = 0; i < adjustedPositions.length; i++) {
      const pos = adjustedPositions[i];
      if (!pos.isVisible) continue;

      let adjustedScale = pos.scale;
      const imageSize = baseImageSize * adjustedScale;

      for (let j = 0; j < adjustedPositions.length; j++) {
        if (i === j) continue;

        const other = adjustedPositions[j];
        if (!other.isVisible) continue;

        const otherSize = baseImageSize * other.scale;
        const dx = pos.x - other.x;
        const dy = pos.y - other.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const minDistance = (imageSize + otherSize) / 2 + 25;

        if (distance < minDistance && distance > 0) {
          const overlap = minDistance - distance;
          const reductionFactor = Math.max(0.4, 1 - (overlap / minDistance) * 0.6);
          adjustedScale = Math.min(adjustedScale, adjustedScale * reductionFactor);
        }
      }

      adjustedPositions[i] = { ...pos, scale: Math.max(0.25, adjustedScale) };
    }

    return adjustedPositions;
  }, [imagePositions, rotation, actualSphereRadius, baseImageSize]);

  const updateMomentum = useCallback(() => {
    if (isDragging || prefersReducedMotion) {
      if (prefersReducedMotion) setVelocity({ x: 0, y: 0 });
      return;
    }

    setVelocity((prev) => {
      const newVelocity = { x: prev.x * momentumDecay, y: prev.y * momentumDecay };
      if (!autoRotate && Math.abs(newVelocity.x) < 0.01 && Math.abs(newVelocity.y) < 0.01) {
        return { x: 0, y: 0 };
      }
      return newVelocity;
    });

    setRotation((prev) => {
      let newY = prev.y;
      if (autoRotate) newY += autoRotateSpeed;
      newY += clampRotationSpeed(velocity.y);

      return {
        x: SPHERE_MATH.normalizeAngle(prev.x + clampRotationSpeed(velocity.x)),
        y: SPHERE_MATH.normalizeAngle(newY),
        z: prev.z,
      };
    });
  }, [isDragging, prefersReducedMotion, momentumDecay, velocity, clampRotationSpeed, autoRotate, autoRotateSpeed]);

  const handleMouseDown = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    setIsDragging(true);
    setVelocity({ x: 0, y: 0 });
    lastMousePos.current = { x: event.clientX, y: event.clientY };
  }, []);

  const handleMouseMove = useCallback((event: MouseEvent) => {
    if (!isDragging) return;

    const deltaX = event.clientX - lastMousePos.current.x;
    const deltaY = event.clientY - lastMousePos.current.y;
    const rotationDelta = { x: -deltaY * dragSensitivity, y: deltaX * dragSensitivity };

    setRotation((prev) => ({
      x: SPHERE_MATH.normalizeAngle(prev.x + clampRotationSpeed(rotationDelta.x)),
      y: SPHERE_MATH.normalizeAngle(prev.y + clampRotationSpeed(rotationDelta.y)),
      z: prev.z,
    }));
    setVelocity({
      x: clampRotationSpeed(rotationDelta.x),
      y: clampRotationSpeed(rotationDelta.y),
    });
    lastMousePos.current = { x: event.clientX, y: event.clientY };
  }, [isDragging, dragSensitivity, clampRotationSpeed]);

  const handleMouseUp = useCallback(() => setIsDragging(false), []);

  const handleTouchStart = useCallback((event: React.TouchEvent) => {
    event.preventDefault();
    const touch = event.touches[0];
    if (!touch) return;
    setIsDragging(true);
    setVelocity({ x: 0, y: 0 });
    lastMousePos.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const handleTouchMove = useCallback((event: TouchEvent) => {
    if (!isDragging) return;
    event.preventDefault();

    const touch = event.touches[0];
    if (!touch) return;
    const deltaX = touch.clientX - lastMousePos.current.x;
    const deltaY = touch.clientY - lastMousePos.current.y;
    const rotationDelta = { x: -deltaY * dragSensitivity, y: deltaX * dragSensitivity };

    setRotation((prev) => ({
      x: SPHERE_MATH.normalizeAngle(prev.x + clampRotationSpeed(rotationDelta.x)),
      y: SPHERE_MATH.normalizeAngle(prev.y + clampRotationSpeed(rotationDelta.y)),
      z: prev.z,
    }));
    setVelocity({
      x: clampRotationSpeed(rotationDelta.x),
      y: clampRotationSpeed(rotationDelta.y),
    });
    lastMousePos.current = { x: touch.clientX, y: touch.clientY };
  }, [isDragging, dragSensitivity, clampRotationSpeed]);

  const handleTouchEnd = useCallback(() => setIsDragging(false), []);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handlePreferenceChange = () => setPrefersReducedMotion(mediaQuery.matches);

    handlePreferenceChange();
    mediaQuery.addEventListener('change', handlePreferenceChange);

    return () => mediaQuery.removeEventListener('change', handlePreferenceChange);
  }, []);

  useEffect(() => {
    setImagePositions(generateSpherePositions());
  }, [generateSpherePositions]);

  useEffect(() => {
    const animate = () => {
      updateMomentum();
      animationFrame.current = requestAnimationFrame(animate);
    };

    if (isMounted && !prefersReducedMotion) animationFrame.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrame.current) cancelAnimationFrame(animationFrame.current);
    };
  }, [isMounted, prefersReducedMotion, updateMomentum]);

  useEffect(() => {
    if (!isMounted || !containerRef.current) return;

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isMounted, handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd]);

  const worldPositions = calculateWorldPositions();

  const renderImageNode = useCallback((image: ImageData, index: number) => {
    const position = worldPositions[index];
    if (!position || !position.isVisible) return null;

    const imageSize = baseImageSize * position.scale;
    const isHovered = hoveredIndex === index;
    const finalScale = isHovered ? Math.min(1.2, 1.2 / position.scale) : 1;

    return (
      <div
        key={image.id}
        className="absolute cursor-pointer select-none transition-transform duration-200 ease-out"
        style={{
          width: `${imageSize}px`,
          height: `${imageSize}px`,
          left: `${renderedContainerSize / 2 + position.x}px`,
          top: `${renderedContainerSize / 2 + position.y}px`,
          opacity: position.fadeOpacity,
          transform: `translate(-50%, -50%) scale(${finalScale})`,
          zIndex: position.zIndex,
        }}
        onMouseEnter={() => setHoveredIndex(index)}
        onMouseLeave={() => setHoveredIndex(null)}
      >
        <div className="relative h-full w-full overflow-hidden rounded-full border-2 border-white/20 shadow-lg">
          {image.isPlaceholder ? (
            <div className="h-full w-full rounded-full bg-black" aria-hidden="true" />
          ) : (
            <img
              src={image.src}
              alt={image.alt}
              className="h-full w-full object-cover"
              draggable={false}
              loading={index < 3 ? 'eager' : 'lazy'}
            />
          )}
        </div>
      </div>
    );
  }, [worldPositions, baseImageSize, renderedContainerSize, hoveredIndex]);

  if (!isMounted) {
    return (
      <div
        className="flex animate-pulse items-center justify-center rounded-lg bg-gray-100 motion-reduce:animate-none"
        style={{
          width: responsive ? '100%' : containerSize,
          height: renderedContainerSize,
        }}
      >
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!images.length) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50"
        style={{
          width: responsive ? '100%' : containerSize,
          height: renderedContainerSize,
        }}
      >
        <div className="text-center text-gray-400">
          <p>No images provided</p>
          <p className="text-sm">Add images to the images prop</p>
        </div>
      </div>
    );
  }

  return (
      <div
        ref={containerRef}
        className={`relative max-w-full select-none cursor-grab active:cursor-grabbing motion-reduce:transition-none ${className}`}
        style={{
          width: responsive ? '100%' : containerSize,
          height: renderedContainerSize,
          perspective: `${perspective}px`,
        }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      >
        <div className="relative h-full w-full motion-reduce:transition-none" style={{ zIndex: 10 }}>
          {images.map((image, index) => renderImageNode(image, index))}
        </div>
      </div>
  );
};

export default SphereImageGrid;
