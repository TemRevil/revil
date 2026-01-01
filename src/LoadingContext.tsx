import React, { createContext, useContext, useState, ReactNode, useCallback, useRef } from 'react';
import Loader from './components/dashboard/Loader';

interface LoadingContextType {
    setIsLoading: (loading: boolean) => void;
}

const LoadingContext = createContext<LoadingContextType | undefined>(undefined);

export const LoadingProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [isLoading, setIsLoading] = useState(false);
    const loadingCount = useRef(0);
    const minLoadTime = 500; // ms
    const startTime = useRef(0);

    const setGlobalLoading = useCallback((loading: boolean) => {
        if (loading) {
            loadingCount.current++;
            if (loadingCount.current === 1) {
                startTime.current = Date.now();
                setIsLoading(true);
            }
        } else {
            loadingCount.current = Math.max(0, loadingCount.current - 1);
            if (loadingCount.current === 0) {
                const elapsed = Date.now() - startTime.current;
                const remaining = Math.max(0, minLoadTime - elapsed);

                setTimeout(() => {
                    if (loadingCount.current === 0) {
                        setIsLoading(false);
                    }
                }, remaining);
            }
        }
    }, []);

    return (
        <LoadingContext.Provider value={{ setIsLoading: setGlobalLoading }}>
            {children}
            <Loader isOpen={isLoading} />
        </LoadingContext.Provider>
    );
};

export const useLoading = () => {
    const context = useContext(LoadingContext);
    if (!context) {
        throw new Error('useLoading must be used within a LoadingProvider');
    }
    return context;
};
