const signatureWords = ['Built', 'with', '❤️', 'for', 'Indians'];

export default function HandwrittenSignature() {
  return (
    <div className="handwritten-signature" aria-label="Built with love for Indians">
      <span className="signature-split-flap" aria-hidden="true">
        {signatureWords.map((word) => (
          <span className="signature-split-flap-word" key={word}>
            {(word === '❤️' ? [word] : Array.from(word)).map((character, index) => (
              <span
                className={`signature-split-flap-tile${word === '❤️' ? ' is-heart' : ''}`}
                key={`${character}-${index}`}
              >
                <span className="signature-split-flap-half signature-split-flap-top">
                  <span>{character}</span>
                </span>
                <span className="signature-split-flap-half signature-split-flap-bottom">
                  <span>{character}</span>
                </span>
              </span>
            ))}
          </span>
        ))}
      </span>
    </div>
  );
}
