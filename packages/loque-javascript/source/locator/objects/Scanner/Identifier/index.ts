// #region imports
    // #region external
    import Token from '../../Token';
    // #endregion external
// #endregion imports



// #region module
class Identifier {
    private current = 0;
    private tokens: Token[];

    constructor(
        tokens: Token[],
    ) {
        this.tokens = tokens;
    }

    public identify() {
        if (this.tokens.length === 0) {
            return [];
        }

        const tokens: Token[] = [];

        while(
            !this.isAtEnd()
        ) {
            this.advance();
        }

        return tokens;
    }


    private isAtEnd() {
        return this.current >= this.tokens.length;
    }

    private advance() {
        this.current += 1;
    }
}
// #endregion module



// #region exports
export default Identifier;
// #endregion exports
