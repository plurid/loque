// #region module
export interface LocatorDocument {
    type: 'document',
    keys: LocatorKey[];
    cursor?: LocatorCursor;
}


export interface LocatorKey {
    key: string;
    value: string;
    comparison: LocatorKeyComparison;
    option?: LocatorKeyOption;
}

export type LocatorKeyComparison = ':' | '!:' | '<' | '<:' | '>' | '>:';
export type LocatorKeyOption = 'and' | 'or';


export interface LocatorCursor {
    id?: string;
    value?: number;
    taker?: LocatorCursorTaker;
    modifier?: LocatorCursorModifier;
}

export type LocatorCursorTaker = 'all' | 'first' | 'last';
export type LocatorCursorModifier = 'above' | 'below';


export interface LocatorCollection {
    type: 'collection',
    value: string,
}


export type Locator = LocatorDocument | LocatorCollection;
// #endregion module
