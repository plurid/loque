// #region imports
    // #region external
    // import Token from '../Token';
    // #endregion external
// #endregion imports



// #region module
export type LocatorStatements = (CollectionStatement | DocumentStatement)[];


export abstract class Statement {
    abstract accept<T>(
        visitor: Visitor<T>,
    ): T;
}


export interface Visitor<T> {
    visitCollectionStatement: (collectionStatement: CollectionStatement) => T;
    visitDocumentStatement: (documentStatement: DocumentStatement) => T;
}


export class CollectionStatement extends Statement {
    public name: string;
    // public expression: Expression;

    constructor(
        name: string,
        // expression: Expression,
    ) {
        super();

        this.name = name;
        // this.expression = expression;
    }

    accept<T>(
        visitor: Visitor<T>,
    ) {
        return visitor.visitCollectionStatement(this);
    }
}


export class DocumentStatement extends Statement {
    // public expression: Expression;
    public keys: any;

    constructor(
        keys: any,
        // expression: Expression,
    ) {
        super();

        this.keys = keys;
        // this.expression = expression;
    }

    accept<T>(
        visitor: Visitor<T>,
    ) {
        return visitor.visitDocumentStatement(this);
    }
}
// #endregion module
