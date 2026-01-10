# Anime.js v4 Advanced

SVG, scroll, utilities, TypeScript, performance.

## SVG Animations

```javascript
import { animate, svg } from 'animejs';

// Morph path
animate('#path1', { d: svg.morphTo('#path2'), duration: 1 });

// Draw line
const drawable = svg.createDrawable('.svg-path');
animate(drawable, { draw: '0% 100%', duration: 2 });

// Motion path
const motionPath = svg.createMotionPath('#motion-path');
animate('.element', { x: motionPath.translateX, y: motionPath.translateY, rotate: motionPath.rotate });
```

## Scroll-triggered

```javascript
import { createScrollObserver } from 'animejs';

createScrollObserver({
  target: '.scroll-element',
  root: document.querySelector('.scroll-container'),
  play: () => animate('.element', { x: 250, duration: 1 }),
  visibility: 0.5
});
```

## Utilities

```javascript
import { utils } from 'animejs';

// DOM selection
const elements = utils.$('.elements');

// Get current value
const currentX = utils.get('.element', 'translateX');

// Set immediately
utils.set('.element', { x: 100, opacity: 0.5 });

// Remove animations
utils.remove('.element');

// Math
utils.random(0, 100);
utils.shuffle([1, 2, 3, 4]);
utils.lerp(0, 100, 0.5); // 50
utils.clamp(150, 0, 100); // 100
```

## TypeScript

```typescript
import { animate, createTimeline, JSAnimation, Timeline, AnimationParams, TimelineParams } from 'animejs';

const animation: JSAnimation = animate('.element', { x: 250, duration: 1 } as AnimationParams);
const timeline: Timeline = createTimeline({ defaults: { duration: 0.8 } } as TimelineParams);
```

## Performance Tips

### Use transforms
```javascript
// Good - GPU accelerated
animate('.element', { x: 100, scale: 1.1 });

// Avoid - triggers layout
animate('.element', { left: 100, width: 200 });
```

### Batch in timelines
```javascript
// Good
const tl = createTimeline();
elements.forEach(el => tl.add(el, { x: 100 }));

// Avoid
elements.forEach(el => animate(el, { x: 100 }));
```

### CSS will-change
```css
.animated-element {
  will-change: transform, opacity;
}
```

## Transform Properties

Both work, shorthand preferred:
```javascript
animate('.element', { x: 100, y: 50, z: 25 });           // shorthand
animate('.element', { translateX: 100, translateY: 50 }); // explicit
```

## Keyframes

```javascript
animate('.element', {
  x: { to: [0, 100, 50], duration: 2 },
  y: { to: [0, -50, 0], duration: 2 },
  scale: [0, 1.2, 1],
  ease: 'outElastic(1, 0.5)'
});
```

## v3 Patterns to NEVER Use

```javascript
// ALL WRONG - v3 syntax:
anime({ ... })
anime.timeline()
anime.stagger()
{ targets: '...' }
{ easing: '...' }
{ value: ... }
{ direction: 'alternate' }
```

## Installation

```bash
npm install animejs
```
