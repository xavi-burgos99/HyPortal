import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Button from '../common/Button/Button';
import './WelcomeScreen.scss';

type SlideDefinition = {
  titleKey: string;
  subtitleKey: string;
  image: string;
  buttonKey: string;
};

type TextState = {
  currentTitleKey: string;
  currentSubtitleKey: string;
  previousTitleKey: string | null;
  previousSubtitleKey: string | null;
  titleDirection: 'left' | 'right';
  subtitleDirection: 'left' | 'right';
  titleChanged: boolean;
  subtitleChanged: boolean;
};

const welcomeLogoImage = './logos/icon.png';
const welcomeIllustration = './images/avatars_welcome.png';

const SLIDES: SlideDefinition[] = [
  {
    titleKey: 'welcome.slides.intro.title',
    subtitleKey: 'welcome.slides.intro.subtitle',
    image: welcomeLogoImage,
    buttonKey: 'welcome.actions.next'
  },
  {
    titleKey: 'welcome.slides.downloads.title',
    subtitleKey: 'welcome.slides.downloads.subtitle',
    image: welcomeIllustration,
    buttonKey: 'welcome.actions.next'
  },
  {
    titleKey: 'welcome.slides.install.title',
    subtitleKey: 'welcome.slides.install.subtitle',
    image: welcomeIllustration,
    buttonKey: 'welcome.actions.next'
  },
  {
    titleKey: 'welcome.slides.mods.title',
    subtitleKey: 'welcome.slides.mods.subtitle',
    image: welcomeIllustration,
    buttonKey: 'welcome.actions.finish'
  }
];

type WelcomeScreenProps = {
  onFinish: () => void;
};

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onFinish }) => {
  const { t } = useTranslation();
  const [activeIndex, setActiveIndex] = useState(0);
  const [slideDirection, setSlideDirection] = useState<'left' | 'right'>('right');
  const [imagePrevious, setImagePrevious] = useState(SLIDES[0].image);
  const [imageAnimationName, setImageAnimationName] = useState<string | undefined>(undefined);
  const imageTimer = useRef<number | null>(null);
  const [textState, setTextState] = useState<TextState>({
    currentTitleKey: SLIDES[0].titleKey,
    currentSubtitleKey: SLIDES[0].subtitleKey,
    previousTitleKey: null,
    previousSubtitleKey: null,
    titleDirection: 'right',
    subtitleDirection: 'right',
    titleChanged: false,
    subtitleChanged: false
  });
  const titleExitTimer = useRef<number | null>(null);
  const subtitleExitTimer = useRef<number | null>(null);
  const currentSlide = SLIDES[activeIndex];

  const animateImage = (direction: 'left' | 'right', nextImage: string) => {
    const animation = direction === 'right' ? 'hp-slide-from-right' : 'hp-slide-from-left';
    setImageAnimationName(animation);
    if (imageTimer.current) {
      window.clearTimeout(imageTimer.current);
    }
    imageTimer.current = window.setTimeout(() => {
      setImageAnimationName(undefined);
      imageTimer.current = null;
    }, 450);
    setImagePrevious(nextImage);
  };

  const goToSlide = (nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= SLIDES.length || nextIndex === activeIndex) return;
    const direction = nextIndex > activeIndex ? 'right' : 'left';
    setSlideDirection(direction);
    const nextSlide = SLIDES[nextIndex];
    const titleChanged = nextSlide.titleKey !== textState.currentTitleKey;
    const subtitleChanged = nextSlide.subtitleKey !== textState.currentSubtitleKey;
    const imageChanged = nextSlide.image !== imagePrevious;
    if (imageChanged) {
      animateImage(direction, nextSlide.image);
    } else {
      setImageAnimationName(undefined);
    }
    setTextState((prev) => ({
      currentTitleKey: nextSlide.titleKey,
      currentSubtitleKey: nextSlide.subtitleKey,
      previousTitleKey: titleChanged ? prev.currentTitleKey : null,
      previousSubtitleKey: subtitleChanged ? prev.currentSubtitleKey : null,
      titleDirection: direction,
      subtitleDirection: direction,
      titleChanged,
      subtitleChanged
    }));
    setActiveIndex(nextIndex);
  };

  const handleNext = () => {
    if (activeIndex >= SLIDES.length - 1) {
      onFinish();
      return;
    }
    goToSlide(activeIndex + 1);
  };

  const handleBack = () => {
    if (activeIndex === 0) return;
    goToSlide(activeIndex - 1);
  };

  useEffect(() => {
    if (!textState.titleChanged || !textState.previousTitleKey) return;
    if (titleExitTimer.current) {
      window.clearTimeout(titleExitTimer.current);
    }
    titleExitTimer.current = window.setTimeout(() => {
      setTextState((prev) => ({ ...prev, previousTitleKey: null, titleChanged: false }));
      titleExitTimer.current = null;
    }, 450);
    return () => {
      if (titleExitTimer.current) {
        window.clearTimeout(titleExitTimer.current);
        titleExitTimer.current = null;
      }
    };
  }, [textState.titleChanged, textState.previousTitleKey]);

  useEffect(() => {
    if (!textState.subtitleChanged || !textState.previousSubtitleKey) return;
    if (subtitleExitTimer.current) {
      window.clearTimeout(subtitleExitTimer.current);
    }
    subtitleExitTimer.current = window.setTimeout(() => {
      setTextState((prev) => ({ ...prev, previousSubtitleKey: null, subtitleChanged: false }));
      subtitleExitTimer.current = null;
    }, 450);
    return () => {
      if (subtitleExitTimer.current) {
        window.clearTimeout(subtitleExitTimer.current);
        subtitleExitTimer.current = null;
      }
    };
  }, [textState.subtitleChanged, textState.previousSubtitleKey]);

  useEffect(() => {
    return () => {
      if (imageTimer.current) {
        window.clearTimeout(imageTimer.current);
      }
      if (titleExitTimer.current) {
        window.clearTimeout(titleExitTimer.current);
      }
      if (subtitleExitTimer.current) {
        window.clearTimeout(subtitleExitTimer.current);
      }
    };
  }, []);

  return (
    <div className="hp-welcome">
      <div className="hp-welcome__panel">
        <div className="hp-welcome__image">
          <img
            src={currentSlide.image}
            alt={t(currentSlide.titleKey)}
            key={`image-${activeIndex}`}
            style={{ animationName: imageAnimationName }}
          />
        </div>
        <div className="hp-welcome__body">
          <div className="hp-welcome__text-block">
            {textState.previousTitleKey && (
              <p
                className="hp-welcome__text-line hp-welcome__text-line--exit hp-welcome__text-line--title"
                data-direction={textState.titleDirection}
              >
                {t(textState.previousTitleKey)}
              </p>
            )}
            <p
              className={`hp-welcome__text-line${textState.titleChanged ? ' hp-welcome__text-line--enter' : ''} hp-welcome__text-line--title`}
              data-direction={textState.titleDirection}
            >
              {t(textState.currentTitleKey)}
            </p>
          </div>
          <div className="hp-welcome__text-block hp-welcome__text-block--subtitle">
            {textState.previousSubtitleKey && (
              <p
                className="hp-welcome__text-line hp-welcome__text-line--exit hp-welcome__text-line--subtitle"
                data-direction={textState.subtitleDirection}
              >
                {t(textState.previousSubtitleKey)}
              </p>
            )}
            <p
              className={`hp-welcome__text-line${textState.subtitleChanged ? ' hp-welcome__text-line--enter' : ''} hp-welcome__text-line--subtitle`}
              data-direction={textState.subtitleDirection}
            >
              {t(textState.currentSubtitleKey)}
            </p>
          </div>
        </div>
        <div className="hp-welcome__actions">
          <div className="hp-welcome__buttons">
            <Button
              label={t('welcome.actions.back')}
              variant="surface"
              onClick={handleBack}
              disabled={activeIndex === 0}
              style={{ minWidth: 90 }}
            />
          </div>
          <div className="hp-welcome__points">
            {SLIDES.map((_, index) => (
              <button
                key={`point-${index}`}
                className={`hp-welcome__point${index === activeIndex ? ' hp-welcome__point--active' : ''}`}
                type="button"
                onClick={() => goToSlide(index)}
                aria-label={t('welcome.paginationLabel', { index: index + 1 })}
              />
            ))}
          </div>
          <div className="hp-welcome__buttons">
            <Button label={t(currentSlide.buttonKey)} variant="primary" onClick={handleNext} style={{ minWidth: 90 }} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default WelcomeScreen;
