import React from 'react';
import './LoadingScreen.css';

interface LoadingScreenProps {
    visible: boolean;
    onDismiss?: () => void;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ visible, onDismiss }) => {
    if (!visible) return null;

    return (
        <div className="loading-overlay" onClick={onDismiss}>
            <div className="loading-content">
                <div className="loading-spinner" />
                <div className="loading-brand">OpticLink</div>
                <div className="loading-sub">Starting...</div>
            </div>
        </div>
    );
};

export default LoadingScreen;
