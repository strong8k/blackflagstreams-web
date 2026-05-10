import React, { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import PosterCard from './PosterCard';
import './ContentRow.css';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.04, delayChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, x: 20 },
  visible: { opacity: 1, x: 0, transition: { type: 'spring', stiffness: 260, damping: 24 } },
};

export default function ContentRow({ title, items, type, icon, loading }) {
  const scrollRef = useRef(null);
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(true);

  const checkScroll = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setShowLeft(scrollLeft > 10);
    setShowRight(scrollLeft < scrollWidth - clientWidth - 10);
  };

  const scroll = (dir) => {
    if (!scrollRef.current) return;
    const amount = scrollRef.current.offsetWidth * 0.75;
    scrollRef.current.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' });
  };

  if (loading) {
    return (
      <div className="content-row">
        <div className="content-row-header">
          <h2 className="section-title">{icon && <span className="icon">{icon}</span>}{title}</h2>
        </div>
        <div className="content-row-scroll">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ width: 150, aspectRatio: '2/3', borderRadius: 'var(--radius-md)', flexShrink: 0 }} />
          ))}
        </div>
      </div>
    );
  }

  if (!items || items.length === 0) return null;

  return (
    <section className="content-row">
      <div className="content-row-header">
        <h2 className="section-title">
          {icon && <span className="icon">{icon}</span>}
          {title}
        </h2>
      </div>

      <div className="content-row-track">
        {showLeft && (
          <button className="row-arrow row-arrow-left" onClick={() => scroll('left')} aria-label="Scroll left">
            ‹
          </button>
        )}

        <motion.div
          className="content-row-scroll"
          ref={scrollRef}
          onScroll={checkScroll}
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-40px' }}
        >
          {items.map((item, i) => (
            <motion.div key={`${item.id}-${i}`} variants={itemVariants} className="content-row-item">
              <PosterCard item={item} type={type} />
            </motion.div>
          ))}
        </motion.div>

        {showRight && (
          <button className="row-arrow row-arrow-right" onClick={() => scroll('right')} aria-label="Scroll right">
            ›
          </button>
        )}
      </div>
    </section>
  );
}
